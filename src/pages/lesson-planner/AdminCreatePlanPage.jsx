// Admin → Plans → New plan: the admin assigns a plan to a teacher.
//   Step 1 (form):    teacher · class & subject (from that teacher's timetable) · what to teach · dates · template + note
//   Step 2 (preview): where every lesson lands; untick / reorder / change periods for THIS plan only; then create.
// The plan belongs to the teacher (draft). The teacher is notified, fills the lesson details and submits.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, CalendarX2, Eye, RefreshCw, Send } from 'lucide-react';
import Card from '@/components/common/Card';
import { Segmented } from '@/components/common/Tabs';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { addDays, fmt, parseISO, startOfWeek, todayISO, toISO } from '@/utils/date';

const presets = () => {
  const ws = startOfWeek(todayISO());
  const d = parseISO(todayISO());
  return {
    this: [ws, addDays(ws, 5)],
    next: [addDays(ws, 7), addDays(ws, 12)],
    two: [addDays(ws, 7), addDays(ws, 19)],
    month: [todayISO(), toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))],
  };
};

const moveIn = (list, from, to) => {
  const copy = [...list];
  if (to < 0 || to >= copy.length) return copy;
  const [x] = copy.splice(from, 1);
  copy.splice(to, 0, x);
  return copy;
};

export default function AdminCreatePlanPage() {
  const { user, masters, myAssignments, sectionLabel, subjectName, staffName } = useApp();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const teachers = useMemo(
    () => masters.staff.filter((s) => s.role === 'teacher' && s.active !== false),
    [masters.staff],
  );
  const [teacherId, setTeacherId] = useState(params.get('teacherId') || '');
  const assignments = useMemo(() => (teacherId ? myAssignments(teacherId) : []), [myAssignments, teacherId]);
  const [pick, setPick] = useState(null);

  const [syllabus, setSyllabus] = useState(undefined); // undefined = not loaded, null = none
  const [mode, setMode] = useState('next'); // 'next' = next topics automatically, 'choose' = ticked topics
  const [ticked, setTicked] = useState(() => new Set());

  const [range, setRange] = useState('next');
  const [dates, setDates] = useState(presets().next);
  const [templateId, setTemplateId] = useState(masters.templates.find((t) => t.isDefault)?.id);
  const [note, setNote] = useState('');

  const [preview, setPreview] = useState(null); // the server's answer
  const [order, setOrder] = useState([]); // [{ id, title, chapterTitle, periods, include }]
  const [orderChanged, setOrderChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  // A new teacher → choose the class again
  useEffect(() => {
    setPick(null);
    setPreview(null);
  }, [teacherId]);

  // Load the syllabus for the chosen class + subject
  useEffect(() => {
    setSyllabus(undefined);
    setTicked(new Set());
    setPreview(null);
    if (!pick) return;
    lessonPlannerApi
      .getSyllabus({ classId: pick.classId, subjectId: pick.subjectId })
      .then((r) => setSyllabus(r.data))
      .catch(() => setSyllabus(null));
  }, [pick]);

  const topicsById = useMemo(() => {
    const map = new Map();
    syllabus?.chapters.forEach((c) => c.topics.forEach((t) => map.set(t.id, { ...t, chapterTitle: c.title })));
    return map;
  }, [syllabus]);

  const chosenIds = useMemo(
    () => (syllabus?.chapters || []).flatMap((c) => c.topics.filter((t) => ticked.has(t.id)).map((t) => t.id)),
    [syllabus, ticked],
  );
  const chosenPeriods = chosenIds.reduce((a, id) => a + Number(topicsById.get(id)?.estPeriods || 0), 0);

  const toggleTopic = (id) =>
    setTicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleChapter = (ch) =>
    setTicked((s) => {
      const n = new Set(s);
      const all = ch.topics.every((t) => n.has(t.id));
      ch.topics.forEach((t) => (all ? n.delete(t.id) : n.add(t.id)));
      return n;
    });

  const choose = (v) => {
    setRange(v);
    if (v !== 'custom') setDates(presets()[v]);
  };

  // The request body; `fromOrder` = use the preview's own order / periods (after the admin changed them)
  const body = (fromOrder = false) => {
    const b = {
      teacherId,
      classId: pick.classId,
      sectionId: pick.sectionId,
      subjectId: pick.subjectId,
      startDate: dates[0],
      endDate: dates[1],
      templateId,
      note: note.trim() || undefined,
    };
    if (fromOrder) {
      const kept = order.filter((o) => o.include);
      b.topicIds = kept.map((o) => o.id);
      const changed = kept.filter((o) => Number(o.periods) !== Number(topicsById.get(o.id)?.estPeriods));
      if (changed.length) b.topicPeriods = Object.fromEntries(changed.map((o) => [o.id, Number(o.periods)]));
    } else if (mode === 'choose') {
      b.topicIds = chosenIds;
    }
    return b;
  };

  const runPreview = async (fromOrder = false) => {
    setBusy(true);
    try {
      const b = body(fromOrder);
      const { data } = await lessonPlannerApi.previewPlan(b, user);
      setPreview({ ...data, body: b });
      if (!fromOrder) {
        // The order list: the topics in the order the engine used, then those that did not fit
        const ids = [...new Set([...data.lessons.map((l) => l.topicId), ...data.unscheduled.map((u) => u.id)])];
        setOrder(
          ids.map((id) => {
            const t = topicsById.get(id);
            return {
              id,
              title: t?.title ?? id,
              chapterTitle: t?.chapterTitle,
              periods: t?.estPeriods ?? 1,
              include: true,
            };
          }),
        );
      }
      setOrderChanged(false);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const { data } = await lessonPlannerApi.generatePlan(preview.body, user);
      toast(`Plan created for ${staffName(teacherId)} – ${data.placedCount} lessons. The teacher has been told.`);
      navigate(`/lesson-planner/plans/${data.plan.id}`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const changeOrder = (fn) => {
    setOrder(fn);
    setOrderChanged(true);
  };

  const formReady =
    teacherId &&
    pick &&
    syllabus &&
    dates[0] &&
    dates[1] &&
    dates[0] <= dates[1] &&
    (mode === 'next' || chosenIds.length);

  // ───────────── Step 2: preview ─────────────
  if (preview) {
    const neededNow = order.filter((o) => o.include).reduce((a, o) => a + Number(o.periods || 0), 0);
    const short = preview.neededPeriods > preview.freeSlots;
    return (
      <div className="stack" style={{ gap: 20 }}>
        <Card>
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div className="strong">
                {staffName(teacherId)} · {sectionLabel(pick.sectionId)} {subjectName(pick.subjectId)}
              </div>
              <div className="faint small">
                {fmt(dates[0])} – {fmt(dates[1])} · {preview.lessons.length} lessons · nothing is saved yet
              </div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => setPreview(null)} disabled={busy}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="btn" onClick={() => runPreview(true)} disabled={busy || !orderChanged}>
                <RefreshCw size={16} /> Re-generate
              </button>
              <button
                className="btn primary"
                onClick={create}
                disabled={busy || orderChanged || !preview.lessons.length}
                title={orderChanged ? 'Re-generate first to see your changes' : undefined}
              >
                <Send size={16} /> Create plan &amp; notify teacher
              </button>
            </div>
          </div>
        </Card>

        <div className="grid-3" style={{ alignItems: 'start' }}>
          <Card title="Order for this plan">
            <div className="stack" style={{ gap: 8 }}>
              <p className="faint small" style={{ margin: 0 }}>
                Untick, reorder or change periods for this plan only – the syllabus stays the same. Then press
                Re-generate.
              </p>
              {order.map((o, i) => (
                <div key={o.id} className="row" style={{ flexWrap: 'nowrap', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={o.include}
                    aria-label={`Include ${o.title}`}
                    onChange={() =>
                      changeOrder((list) => list.map((x, j) => (j === i ? { ...x, include: !x.include } : x)))
                    }
                  />
                  <div className="order-btns">
                    <button
                      className="icon-btn"
                      aria-label={`Move ${o.title} up`}
                      disabled={i === 0}
                      onClick={() => changeOrder((list) => moveIn(list, i, i - 1))}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      aria-label={`Move ${o.title} down`}
                      disabled={i === order.length - 1}
                      onClick={() => changeOrder((list) => moveIn(list, i, i + 1))}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <span className="small" style={{ flex: 1, opacity: o.include ? 1 : 0.5 }}>
                    {o.title}
                    <br />
                    <span className="faint">{o.chapterTitle}</span>
                  </span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    max="50"
                    style={{ width: 60, padding: '5px 8px' }}
                    value={o.periods}
                    aria-label={`Periods for ${o.title}`}
                    onChange={(e) =>
                      changeOrder((list) => list.map((x, j) => (j === i ? { ...x, periods: e.target.value } : x)))
                    }
                  />
                </div>
              ))}
              <div className="row-between small" style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <span>Needed / free periods</span>
                <span className="strong" style={{ color: short ? 'var(--st-partial)' : 'var(--st-completed)' }}>
                  {orderChanged ? neededNow : preview.neededPeriods} / {preview.freeSlots}
                </span>
              </div>
            </div>
          </Card>

          <Card title="Where each lesson lands" className="span-2">
            {preview.unscheduled.length > 0 && (
              <div
                className="small"
                role="alert"
                style={{
                  background: '#fff3dc',
                  color: '#8a5a00',
                  borderRadius: 10,
                  padding: '10px 12px',
                  marginBottom: 12,
                }}
              >
                <div className="row" style={{ gap: 6 }}>
                  <AlertTriangle size={16} /> <span className="strong">Did not fit</span>
                </div>
                <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
                  {preview.unscheduled.map((u) => (
                    <li key={u.id}>
                      {u.title} – {u.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview.skippedDays.length > 0 && (
              <div className="row small muted" style={{ marginBottom: 10, flexWrap: 'nowrap' }}>
                <CalendarX2 size={16} style={{ flexShrink: 0 }} /> Skipped (holiday / exam):{' '}
                {preview.skippedDays.map((d) => fmt(d)).join(', ')}
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Period</th>
                    <th>Topic</th>
                    <th>Chapter</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.lessons.length === 0 && (
                    <tr>
                      <td colSpan={4} className="faint">
                        No free periods in these dates – they are already planned, holidays or exam days. Go back and
                        choose other dates.
                      </td>
                    </tr>
                  )}
                  {preview.lessons.map((l) => (
                    <tr key={`${l.date}-${l.periodId}`}>
                      <td>{fmt(l.date)}</td>
                      <td>{l.periodLabel || l.periodId}</td>
                      <td>
                        {l.topicTitle}
                        {l.of > 1 && (
                          <span className="faint">
                            {' '}
                            ({l.part}/{l.of})
                          </span>
                        )}
                      </td>
                      <td className="muted">{l.chapterTitle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ───────────── Step 1: the form ─────────────
  return (
    <div className="grid-3" style={{ alignItems: 'start' }}>
      <div className="span-2 stack" style={{ gap: 20 }}>
        <Card title="1. Teacher">
          <div className="field" style={{ maxWidth: 380 }}>
            <label htmlFor="ap-teacher">Choose an active teacher</label>
            <select id="ap-teacher" className="select" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Select a teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card title="2. Class & subject">
          {!teacherId ? (
            <p className="faint">Choose a teacher first.</p>
          ) : assignments.length === 0 ? (
            <p className="faint">
              {staffName(teacherId)} has no periods in the timetable yet. Add them in Classes &amp; Subjects first.
            </p>
          ) : (
            <>
              <p className="faint small" style={{ marginTop: 0 }}>
                Only what {staffName(teacherId)} teaches in the timetable – lessons go into these periods.
              </p>
              <div className="grid-3" style={{ gap: 12 }}>
                {assignments.map((a) => {
                  const active = pick?.sectionId === a.sectionId && pick?.subjectId === a.subjectId;
                  return (
                    <button
                      key={`${a.sectionId}-${a.subjectId}`}
                      onClick={() => setPick(a)}
                      className="card"
                      style={{
                        textAlign: 'left',
                        cursor: 'pointer',
                        border: `2px solid ${active ? 'var(--primary)' : 'var(--line)'}`,
                        background: active ? 'var(--primary-50)' : '#fff',
                        boxShadow: 'none',
                        padding: 14,
                      }}
                      aria-pressed={active}
                    >
                      <div className="strong">{sectionLabel(a.sectionId)}</div>
                      <div className="muted small">
                        {subjectName(a.subjectId)} · {a.periodsPerWeek} periods/week
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        <Card title="3. What to teach">
          {!pick ? (
            <p className="faint">Choose a class and subject first.</p>
          ) : syllabus === undefined ? (
            <p className="faint">Loading the syllabus…</p>
          ) : syllabus === null ? (
            <p className="faint">There is no syllabus for this class and subject yet. Add it on the Syllabus page.</p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'next', label: 'Next topics in syllabus order' },
                  { value: 'choose', label: 'Choose topics' },
                ]}
              />
              {mode === 'next' ? (
                <p className="faint small" style={{ margin: 0 }}>
                  The next topics that are not taught or planned yet, in the syllabus order and chapter dates.
                </p>
              ) : (
                <div className="grid-2" style={{ gap: '10px 24px' }}>
                  {syllabus.chapters.map((ch) => (
                    <div key={ch.id} className="stack" style={{ gap: 6 }}>
                      <label className="check strong">
                        <input
                          type="checkbox"
                          checked={ch.topics.length > 0 && ch.topics.every((t) => ticked.has(t.id))}
                          onChange={() => toggleChapter(ch)}
                        />
                        {ch.title}
                        {ch.startDate && (
                          <span className="faint small" style={{ fontWeight: 400 }}>
                            {' '}
                            · {fmt(ch.startDate)} – {ch.endDate ? fmt(ch.endDate) : '…'}
                          </span>
                        )}
                      </label>
                      {ch.topics.map((t) => (
                        <label key={t.id} className="check small" style={{ paddingLeft: 22 }}>
                          <input type="checkbox" checked={ticked.has(t.id)} onChange={() => toggleTopic(t.id)} />
                          {t.title} · {t.estPeriods}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="stack" style={{ gap: 20 }}>
          <Card title="4. Dates">
            <div className="stack" style={{ gap: 12 }}>
              <Segmented
                value={range}
                onChange={choose}
                options={[
                  { value: 'this', label: 'This week' },
                  { value: 'next', label: 'Next week' },
                  { value: 'two', label: '2 weeks' },
                  { value: 'month', label: 'Month' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ap-from">From</label>
                  <input
                    id="ap-from"
                    type="date"
                    className="input"
                    value={dates[0]}
                    onChange={(e) => {
                      setRange('custom');
                      setDates([e.target.value, dates[1]]);
                    }}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ap-to">To</label>
                  <input
                    id="ap-to"
                    type="date"
                    className="input"
                    min={dates[0]}
                    value={dates[1]}
                    onChange={(e) => {
                      setRange('custom');
                      setDates([dates[0], e.target.value]);
                    }}
                  />
                </div>
              </div>
            </div>
          </Card>
          <Card title="5. Template & note to teacher">
            <div className="stack" style={{ gap: 12 }}>
              <div className="field">
                <label htmlFor="ap-tpl">Lesson template</label>
                <select
                  id="ap-tpl"
                  className="select"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  {masters.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.board})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ap-note">Note to teacher (optional)</label>
                <textarea
                  id="ap-note"
                  className="input"
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Include a hands-on lab for the leaf starch test."
                />
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Card title="Summary">
        <div className="stack" style={{ gap: 10 }}>
          <div className="row-between small">
            <span className="muted">Teacher</span>
            <span className="strong">{teacherId ? staffName(teacherId) : '–'}</span>
          </div>
          <div className="row-between small">
            <span className="muted">Class</span>
            <span className="strong">
              {pick ? `${sectionLabel(pick.sectionId)} ${subjectName(pick.subjectId)}` : '–'}
            </span>
          </div>
          <div className="row-between small">
            <span className="muted">Topics</span>
            <span className="strong">
              {mode === 'next' ? 'next in order' : `${chosenIds.length} · ${chosenPeriods} periods`}
            </span>
          </div>
          <div className="row-between small">
            <span className="muted">Dates</span>
            <span className="strong">
              {fmt(dates[0])} – {fmt(dates[1])}
            </span>
          </div>
          <button className="btn primary" disabled={!formReady || busy} onClick={() => runPreview(false)}>
            <Eye size={16} /> {busy ? 'Working…' : 'Preview plan'}
          </button>
          <span className="faint small" style={{ textAlign: 'center' }}>
            Nothing is saved until you click Create on the next screen.
          </span>
        </div>
      </Card>
    </div>
  );
}