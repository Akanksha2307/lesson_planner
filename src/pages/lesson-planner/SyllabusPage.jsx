import { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Download,
  ListTree,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import Card from '@/components/common/Card';
import EmptyState, { Loader } from '@/components/common/EmptyState';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { useDialog } from '@/context/DialogContext';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { exportToExcel, readSpreadsheet } from '@/utils/exportFile';
import { blockedDates, chapterFit } from '@/utils/periodFit';

const blankTopic = () => ({ title: '', estPeriods: 1, subtopics: [] });

// Moves list[from] to list[to] (in place) – used by the ↑ ↓ buttons
const move = (list, from, to) => {
  if (to < 0 || to >= list.length) return;
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
};

// ↑ ↓ buttons for one chapter or topic
function OrderButtons({ index, count, onMove, what }) {
  return (
    <div className="order-btns" onClick={(e) => e.stopPropagation()}>
      <button
        className="icon-btn"
        aria-label={`Move ${what} up`}
        disabled={index === 0}
        onClick={() => onMove(index - 1)}
      >
        <ArrowUp size={14} />
      </button>
      <button
        className="icon-btn"
        aria-label={`Move ${what} down`}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
      >
        <ArrowDown size={14} />
      </button>
    </div>
  );
}

export default function SyllabusPage() {
  const { masters, ctx, role, sectionLabel } = useApp();
  // Only admin / HOD / principal change the whole syllabus; teachers add topics while planning
  const canEdit = role !== 'teacher';
  const toast = useToast();
  const dialog = useDialog();
  const fileRef = useRef(null);
  const [classId, setClassId] = useState(masters.classes[masters.classes.length - 1].id);
  const [subjectId, setSubjectId] = useState(masters.subjects[0].id);
  const [syl, setSyl] = useState(undefined);
  const [openCh, setOpenCh] = useState({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSyl(undefined);
    setDirty(false);
    lessonPlannerApi.getSyllabus({ classId, subjectId }).then((r) => {
      setSyl(r.data);
      setOpenCh(r.data ? { 0: true } : {});
    });
  }, [classId, subjectId]);

  const update = (fn) => {
    setSyl((s) => fn(structuredClone(s)));
    setDirty(true);
  };
  const blocked = blockedDates(masters.holidays, masters.exams);
  const fitOf = (ch) =>
    chapterFit({
      chapter: ch,
      sections: masters.sections.filter((x) => x.classId === classId),
      timetable: masters.timetable,
      subjectId,
      blocked,
      sectionLabel,
    });
  // Moving a chapter also moves its open / closed state
  const moveChapter = (from, to) => {
    update((s) => {
      move(s.chapters, from, to);
      return s;
    });
    setOpenCh((o) => {
      const flags = syl.chapters.map((_, i) => Boolean(o[i]));
      move(flags, from, to);
      return Object.fromEntries(flags.map((v, i) => [i, v]));
    });
  };

  const totalPeriods =
    syl?.chapters.reduce((a, c) => a + c.topics.reduce((b, t) => b + Number(t.estPeriods || 0), 0), 0) || 0;

  const save = async () => {
    const bad = syl.chapters.some((c) => !c.title.trim() || c.topics.some((t) => !t.title.trim()));
    if (bad) {
      toast('Every chapter and topic needs a name.', 'error');
      return;
    }
    const backwards = syl.chapters.find((c) => c.startDate && c.endDate && c.endDate < c.startDate);
    if (backwards) {
      toast(`"${backwards.title}": the To date is before the From date.`, 'error');
      return;
    }
    setBusy(true);
    try {
      const r = await lessonPlannerApi.saveSyllabus(syl);
      setSyl(r.data);
      setDirty(false);
      toast('Syllabus saved');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file) => {
    try {
      const rows = await readSpreadsheet(file);
      if (
        syl &&
        !(await dialog.confirm({
          title: 'Replace syllabus?',
          message: `The current syllabus will be replaced with ${rows.length} rows from "${file.name}".`,
          confirmLabel: 'Replace',
        }))
      )
        return;
      const r = await lessonPlannerApi.importSyllabus({ classId, subjectId, board: ctx.board, rows });
      setSyl(r.data);
      setDirty(false);
      setOpenCh({ 0: true });
      toast(`Imported ${r.data.chapters.length} chapters`);
    } catch (e) {
      toast(e.message || 'Could not read that file. Use the sample format.', 'error');
    } finally {
      fileRef.current.value = '';
    }
  };

  const sample = () =>
    exportToExcel(
      [
        {
          Chapter: 'Force and Pressure',
          Topic: 'Types of forces',
          Periods: 2,
          Subtopics: 'Contact forces; Non-contact forces',
          Term: 'Term 1',
          From: '2026-07-01',
          To: '2026-07-20',
        },
        {
          Chapter: 'Force and Pressure',
          Topic: 'Pressure',
          Periods: 2,
          Subtopics: 'Pressure = force / area',
          Term: 'Term 1',
          From: '',
          To: '',
        },
        {
          Chapter: 'Friction',
          Topic: 'Factors affecting friction',
          Periods: 1,
          Subtopics: '',
          Term: 'Term 2',
          From: '',
          To: '',
        },
      ],
      'syllabus-sample.xlsx',
      'Syllabus',
    );

  return (
    <>
      <Card>
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ width: 170 }}>
              <label htmlFor="sy-class">Class</label>
              <select id="sy-class" className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {masters.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ width: 190 }}>
              <label htmlFor="sy-subject">Subject</label>
              <select
                id="sy-subject"
                className="select"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                {masters.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row">
            <button className="btn ghost sm" onClick={sample}>
              <Download size={14} /> Sample sheet
            </button>
            {canEdit && (
              <button className="btn sm" onClick={() => fileRef.current.click()}>
                <Upload size={14} /> Import Excel
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => e.target.files[0] && importFile(e.target.files[0])}
            />
            {syl && canEdit && (
              <button className="btn primary sm" onClick={save} disabled={!dirty || busy}>
                <Save size={14} /> {busy ? 'Saving…' : 'Save syllabus'}
              </button>
            )}
          </div>
        </div>
      </Card>

      {syl === undefined ? (
        <Loader />
      ) : syl === null ? (
        <Card>
          <EmptyState
            icon={ListTree}
            title="No syllabus for this class and subject"
            text="Import an Excel sheet with columns Chapter, Topic, Periods, Subtopics (optional: Term, From, To) – or start typing chapters here."
            action={
              canEdit && (
                <button
                  className="btn primary"
                  onClick={() => {
                    setSyl({
                      classId,
                      subjectId,
                      board: ctx.board,
                      chapters: [{ title: '', term: 'Term 1', topics: [blankTopic()] }],
                    });
                    setOpenCh({ 0: true });
                    setDirty(true);
                  }}
                >
                  <Plus size={16} /> Add first chapter
                </button>
              )
            }
          />
        </Card>
      ) : (
        <Card
          title={`${syl.chapters.length} chapters · ${totalPeriods} periods`}
          actions={
            canEdit && (
              <button
                className="btn sm"
                onClick={() => {
                  update((s) => {
                    s.chapters.push({ title: '', term: 'Term 2', topics: [blankTopic()] });
                    return s;
                  });
                  setOpenCh((o) => ({ ...o, [syl.chapters.length]: true }));
                }}
              >
                <Plus size={14} /> Add chapter
              </button>
            )
          }
        >
          {canEdit && (
            <p className="faint small" style={{ margin: '0 0 12px' }}>
              Use ↑ ↓ to set the teaching order. Give a chapter <strong>From – To</strong> dates to fix when it is
              taught; chapters without dates are placed automatically in order.
            </p>
          )}
          <div className="tree">
            {syl.chapters.map((ch, ci) => (
              <div key={ch.id || ci} className="unit">
                <div className="unit-head" onClick={() => setOpenCh((o) => ({ ...o, [ci]: !o[ci] }))}>
                  {openCh[ci] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  {canEdit && (
                    <OrderButtons
                      index={ci}
                      count={syl.chapters.length}
                      what="chapter"
                      onMove={(to) => moveChapter(ci, to)}
                    />
                  )}
                  <span className="num">{ci + 1}</span>
                  <input
                    className="input"
                    style={{ flex: '1 1 260px', minWidth: 220, fontWeight: 600 }}
                    placeholder="Chapter name"
                    value={ch.title}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      update((s) => {
                        s.chapters[ci].title = e.target.value;
                        return s;
                      })
                    }
                    aria-label="Chapter name"
                  />
                  <select
                    className="select"
                    style={{ width: 110 }}
                    value={ch.term}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      update((s) => {
                        s.chapters[ci].term = e.target.value;
                        return s;
                      })
                    }
                    aria-label="Term"
                  >
                    <option>Term 1</option>
                    <option>Term 2</option>
                    <option>Term 3</option>
                  </select>
                  <span className="faint" style={{ whiteSpace: 'nowrap' }}>
                    {ch.topics.length} topics
                  </span>
                  {canEdit && (
                    <button
                      className="icon-btn"
                      aria-label="Delete chapter"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (
                          await dialog.confirm({
                            title: 'Delete chapter?',
                            message: `"${ch.title || 'Untitled'}" and its topics will be removed from this syllabus.`,
                            confirmLabel: 'Delete',
                            danger: true,
                          })
                        )
                          update((s) => {
                            s.chapters.splice(ci, 1);
                            return s;
                          });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  <div className="chapter-schedule" onClick={(e) => e.stopPropagation()}>
                    <div className="chapter-dates" onClick={(e) => e.stopPropagation()}>
                      <label>
                        From{' '}
                        <input
                          type="date"
                          className="input"
                          value={ch.startDate || ''}
                          disabled={!canEdit}
                          onChange={(e) =>
                            update((s) => {
                              s.chapters[ci].startDate = e.target.value;
                              return s;
                            })
                          }
                          aria-label={`From date for chapter ${ci + 1}`}
                        />
                      </label>
                      <label>
                        To{' '}
                        <input
                          type="date"
                          className="input"
                          value={ch.endDate || ''}
                          disabled={!canEdit}
                          onChange={(e) =>
                            update((s) => {
                              s.chapters[ci].endDate = e.target.value;
                              return s;
                            })
                          }
                          aria-label={`To date for chapter ${ci + 1}`}
                        />
                      </label>
                    </div>
                    {(() => {
                      const fit = fitOf(ch);
                      if (!fit)
                        return <span className="fit-chip auto">{ch.startDate ? 'set both dates' : 'automatic'}</span>;
                      return <span className={`fit-chip ${fit.ok ? 'ok' : 'short'}`}>{fit.text}</span>;
                    })()}
                  </div>
                </div>
                {openCh[ci] && (
                  <>
                    <div
                      className={`topic-row faint${canEdit ? ' ordered' : ''}`}
                      style={{ borderTop: '1px solid var(--line)' }}
                    >
                      {canEdit && <span>Order</span>}
                      <span>Topic</span>
                      <span>Subtopics</span>
                      <span>Periods</span>
                      <span />
                    </div>
                    {ch.topics.map((t, ti) => (
                      <div key={t.id || ti} className={`topic-row${canEdit ? ' ordered' : ''}`}>
                        {canEdit && (
                          <OrderButtons
                            index={ti}
                            count={ch.topics.length}
                            what="topic"
                            onMove={(to) =>
                              update((s) => {
                                move(s.chapters[ci].topics, ti, to);
                                return s;
                              })
                            }
                          />
                        )}
                        <input
                          className="input"
                          placeholder="Topic name"
                          value={t.title}
                          onChange={(e) =>
                            update((s) => {
                              s.chapters[ci].topics[ti].title = e.target.value;
                              return s;
                            })
                          }
                          aria-label="Topic name"
                        />
                        <input
                          className="input"
                          placeholder="Separate with ;"
                          value={t.subtopicsText ?? (t.subtopics || []).join('; ')}
                          onChange={(e) =>
                            update((s) => {
                              const tp = s.chapters[ci].topics[ti];
                              tp.subtopicsText = e.target.value;
                              tp.subtopics = e.target.value
                                .split(';')
                                .map((x) => x.trim())
                                .filter(Boolean);
                              return s;
                            })
                          }
                          aria-label="Subtopics"
                        />
                        <input
                          className="input"
                          type="number"
                          min="1"
                          max="20"
                          value={t.estPeriods}
                          onChange={(e) =>
                            update((s) => {
                              s.chapters[ci].topics[ti].estPeriods = e.target.value;
                              return s;
                            })
                          }
                          aria-label="Periods needed"
                        />
                        <button
                          className="icon-btn"
                          aria-label="Delete topic"
                          onClick={() =>
                            update((s) => {
                              s.chapters[ci].topics.splice(ti, 1);
                              return s;
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                    <div style={{ padding: '8px 14px 12px 52px' }}>
                      <button
                        className="btn ghost sm"
                        onClick={() =>
                          update((s) => {
                            s.chapters[ci].topics.push(blankTopic());
                            return s;
                          })
                        }
                      >
                        <Plus size={14} /> Add topic
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}