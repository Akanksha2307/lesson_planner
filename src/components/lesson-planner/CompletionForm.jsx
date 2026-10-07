import { useEffect, useState } from 'react';
import { Info } from 'lucide-react';
import Modal from '@/components/common/Modal';
import { Segmented } from '@/components/common/Tabs';
import { Loader } from '@/components/common/EmptyState';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import { useApp } from '@/context/AppContext';
import { useToast } from '@/context/ToastContext';
import { UNDERSTANDING } from '@/utils/constants';
import { fmt } from '@/utils/date';

const STATUS_OPTIONS = [
  { value: 'completed', label: 'Done' },
  { value: 'partial', label: 'Partly done' },
  { value: 'not_done', label: 'Not done' },
];
const RESULTS = [
  ['yes', 'Achieved'],
  ['partly', 'Partly'],
  ['no', 'Not yet'],
];

export default function CompletionForm({ open, item, initialStatus, onClose, onDone }) {
  const toast = useToast();
  const { masters } = useApp();
  const [subtopics, setSubtopics] = useState(null);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setSubtopics(null);
    lessonPlannerApi.getPlan(item.planId).then((r) => {
      const tp = r.data.topics.find((t) => t.id === item.topicId);
      const subs = tp?.subtopics || [item.topicTitle];
      setSubtopics(subs);
      const prev = item.completion; // already marked -> edit the saved marking
      const status = initialStatus || prev?.status || 'completed';
      setForm({
        status,
        topicsCovered: prev?.topicsCovered || (status === 'completed' ? subs : []),
        objectives: prev?.objectives?.length
          ? prev.objectives
          : (item.details?.objectives || []).map((text) => ({ text, result: status === 'completed' ? 'yes' : 'no' })),
        understanding: prev?.understanding || '',
        remarks: prev?.remarks || '',
        nextLesson: prev?.nextLesson || '',
        sendHomework: prev ? false : !!item.details?.homework,
      });
    });
  }, [open, item, initialStatus]);

  if (!open || !item) return null;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const toggleTopic = (t) => {
    setForm((f) => {
      const covered = f.topicsCovered.includes(t) ? f.topicsCovered.filter((x) => x !== t) : [...f.topicsCovered, t];
      const status = covered.length === subtopics.length ? 'completed' : covered.length ? 'partial' : 'not_done';
      return { ...f, topicsCovered: covered, status };
    });
  };
  const setStatus = (status) =>
    setForm((f) => ({
      ...f,
      status,
      topicsCovered: status === 'completed' ? subtopics : status === 'not_done' ? [] : f.topicsCovered,
    }));

  const submit = async () => {
    if (!form.understanding && form.status !== 'not_done') {
      toast('Choose how well students understood the lesson.', 'error');
      return;
    }
    if (form.status === 'not_done' && !form.remarks.trim()) {
      toast('Add a remark explaining why the lesson was not done.', 'error');
      return;
    }
    setBusy(true);
    try {
      const { data } = await lessonPlannerApi.completeItem(item.id, form);
      toast(
        item.completion ? 'Marking updated' : form.status === 'completed' ? 'Lesson marked as done' : 'Lesson saved',
      );
      if (data.pulledBack)
        toast(
          `The extra period is no longer needed – ${data.pulledBack} later lesson${data.pulledBack > 1 ? 's' : ''} moved back.`,
          'info',
        );
      if (data.continuedTo)
        toast(
          `“${item.topicTitle}” continues on ${fmt(data.continuedTo.date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${data.continuedTo.periodLabel}. You can drag it to another period in the Timetable.`,
          'info',
        );
      if (data.overflow)
        toast(
          `No free period found for “${data.overflow.topicTitle}”. Drag it to a free period in the Calendar.`,
          'info',
        );
      onDone?.(data);
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width={600}
      title={item.completion ? 'Edit marking' : 'Mark lesson'}
      subtitle={`${item.topicTitle} · ${item.classLabel} · ${item.periodLabel}`}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={busy || !form}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {!form ? (
        <Loader />
      ) : (
        <div className="stack" style={{ gap: 20 }}>
          <Segmented options={STATUS_OPTIONS} value={form.status} onChange={setStatus} />

          {form.status !== 'not_done' && (
            <div className="field">
              <span className="field-label">Topics covered</span>
              {subtopics.map((t) => (
                <label key={t} className="check">
                  <input type="checkbox" checked={form.topicsCovered.includes(t)} onChange={() => toggleTopic(t)} />
                  {t}
                </label>
              ))}
            </div>
          )}

          {form.objectives.length > 0 && form.status !== 'not_done' && (
            <div className="field">
              <span className="field-label">Learning objectives</span>
              {form.objectives.map((o, i) => (
                <div key={i} className="row-between" style={{ flexWrap: 'nowrap' }}>
                  <span className="small" style={{ flex: 1 }}>
                    {o.text}
                  </span>
                  <select
                    className="select"
                    style={{ width: 130 }}
                    value={o.result}
                    aria-label={`Result for objective ${i + 1}`}
                    onChange={(e) =>
                      set(
                        'objectives',
                        form.objectives.map((x, k) => (k === i ? { ...x, result: e.target.value } : x)),
                      )
                    }
                  >
                    {RESULTS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {form.status !== 'not_done' && (
            <div className="field">
              <span className="field-label">Students' understanding</span>
              <div className="row">
                {UNDERSTANDING.map((u) => (
                  <label key={u} className="check">
                    <input
                      type="radio"
                      name="understanding"
                      checked={form.understanding === u}
                      onChange={() => set('understanding', u)}
                    />
                    {u}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-grid">
            <div className="field full">
              <label htmlFor="cf-remarks">Remarks{form.status === 'not_done' && ' (required)'}</label>
              <textarea
                id="cf-remarks"
                className="textarea"
                style={{ minHeight: 64 }}
                placeholder={
                  form.status === 'not_done'
                    ? 'e.g. Class used for sports practice'
                    : 'Anything to remember for next time'
                }
                value={form.remarks}
                onChange={(e) => set('remarks', e.target.value)}
              />
            </div>
            <div className="field full">
              <label htmlFor="cf-next">Next lesson</label>
              <input
                id="cf-next"
                className="input"
                placeholder="e.g. Continue with friction"
                value={form.nextLesson}
                onChange={(e) => set('nextLesson', e.target.value)}
              />
            </div>
          </div>

          {item.details?.homework && form.status !== 'not_done' && !item.completion && (
            <label className="check">
              <input
                type="checkbox"
                checked={form.sendHomework}
                onChange={(e) => set('sendHomework', e.target.checked)}
              />
              Send homework to parents{masters.settings.whatsappHomework ? ' on WhatsApp' : ' in the parent app'}:{' '}
              <span className="muted">“{item.details.homework}”</span>
            </label>
          )}

          {form.status !== 'completed' && masters.settings.autoShift && (
            <div
              className="row small"
              style={{
                background: 'var(--primary-50)',
                padding: 12,
                borderRadius: 10,
                flexWrap: 'nowrap',
                alignItems: 'flex-start',
              }}
            >
              <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
              <span>
                The unfinished part of this topic will move to the next available period of this class, and later
                lessons move forward by one. You can drag it to any free period later.
              </span>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
