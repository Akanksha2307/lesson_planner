import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarClock } from 'lucide-react';
import Card from '@/components/common/Card';
import Modal from '@/components/common/Modal';
import { useToast } from '@/context/ToastContext';
import { useDialog } from '@/context/DialogContext';
import { useApp } from '@/context/AppContext';
import { todayISO, fmtLong } from '@/utils/date';
import { lessonPlannerApi } from '@/services/lessonPlannerApi';
import './HolidaysPage.css';

const empty = { name: '', date: '', description: '', unexpected: false };

export default function HolidaysPage() {
  const toast = useToast();
  const dialog = useDialog();
  const { loadMasters, loadNotifications } = useApp();

  const [data, setData] = useState({ holidays: [] });
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [impact, setImpact] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const response = await lessonPlannerApi.getHolidays();

    if (!response.success) {
      throw new Error(response.message || 'Failed to load holidays');
    }

    setData({ holidays: response.data || [] });
  };

  useEffect(() => {
    refresh().catch(() => {
      toast('Failed to load holidays.', 'error');
    });
  }, []);

  useEffect(() => {
    if (!form.unexpected || !form.date || form.date < todayISO()) {
      setImpact(0);
      return;
    }

    let active = true;

    lessonPlannerApi.getHolidayImpact(form.date)
      .then(response => {
        if (active) {
          setImpact(Number(response.data?.impact ?? 0));
        }
      })
      .catch(() => {
        if (active) setImpact(0);
      });

    return () => {
      active = false;
    };
  }, [form.date, form.unexpected]);

  const resetForm = () => {
    setForm(empty);
    setEditing(null);
  };

  const persistHoliday = async (values) => {
    setBusy(true);

    try {
      const response = await lessonPlannerApi.saveHoliday({
        ...(editing ? { id: editing } : {}),
        ...values
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to save holiday');
      }

      await refresh();
      resetForm();
      setConfirm(null);

      await loadMasters?.();
      await loadNotifications?.();

      const result = response.data || {};
      const affected = Number(result.affectedCount ?? 0);
      const moved = Number(result.movedCount ?? 0);

      if (affected > 0) {
        toast(
          `${affected} lessons affected; ${moved} periods shifted forward.`,
          moved < affected ? 'error' : 'success'
        );
      } else {
        toast('Holiday saved successfully.');
      }
    } catch (error) {
      toast(error.message || 'Failed to save holiday.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy) return;

    if (!form.name.trim() || !form.date) {
      toast('Enter a holiday name and date.', 'error');
      return;
    }

    const clash = data.holidays.find(
      h => h.date === form.date && h.id !== editing
    );

    if (clash) {
      toast(
        `${form.date} is already a holiday (${clash.name}).`,
        'error'
      );
      return;
    }

    const before = editing
      ? data.holidays.find(h => h.id === editing)
      : null;

    const dateChanged = !before || before.date !== form.date;
    const becameUnexpected = !before?.unexpected && form.unexpected;

    const shouldExtend =
      form.unexpected &&
      form.date >= todayISO() &&
      (dateChanged || becameUnexpected);

    if (shouldExtend) {
      try {
        const response = await lessonPlannerApi.getHolidayImpact(form.date);

        if (!response.success) {
          throw new Error(response.message || 'Impact check failed');
        }

        const count = Number(response.data?.impact ?? 0);

        if (count > 0) {
          setConfirm({ holiday: { ...form }, impact: count });
          return;
        }
      } catch (error) {
        toast('Unable to check holiday impact. Holiday not saved.', 'error');
        return;
      }
    }

    await persistHoliday(form);
  };

  const confirmExtend = async () => {
    if (busy || !confirm) return;
    await persistHoliday(confirm.holiday);
  };

  const edit = (h) => {
    setEditing(h.id);
    setForm({
      name: h.name,
      date: h.date,
      description: h.description || '',
      unexpected: !!h.unexpected
    });
  };

  const remove = async (h) => {
    if (busy) return;

    const ok = await dialog.confirm({
      title: 'Delete holiday?',
      message:
        `"${h.name}" will be deleted.` +
        (h.movedCount
          ? '\nLessons already moved will stay on their new dates.'
          : ''),
      confirmLabel: 'Delete',
      danger: true
    });

    if (!ok) return;

    setBusy(true);

    try {
      const response = await lessonPlannerApi.deleteHoliday(h.id);

      if (!response.success) {
        throw new Error(response.message || 'Delete failed');
      }

      await refresh();
      await loadMasters?.();
      toast('Holiday deleted successfully.');
    } catch (error) {
      toast(error.message || 'Failed to delete holiday.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...data.holidays].sort(
    (a, b) => a.date.localeCompare(b.date)
  );

  return (
    <div className="holidays-page stack">
      <div className="page-heading">
        <div>
          <h2>Holiday Management</h2>
          <p className="muted">
            Holiday dates are available to planning and examination calculations. Mark a holiday as sudden to extend
            classes instead of cancelling them.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <Card title={editing ? 'Edit holiday' : 'Add holiday'}>
          <div className="form-grid holiday-form">
            <label className="field">
              <span>Name</span>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className="field span-2">
              <span>Description</span>
              <textarea
                className="textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>

            <label className="check span-2 unexpected-check">
              <input
                type="checkbox"
                checked={form.unexpected}
                onChange={(e) => setForm({ ...form, unexpected: e.target.checked })}
              />
              <span>
                <span className="strong">Sudden / unexpected holiday</span>
                <span className="small muted block">
                  Lessons planned on this day move to the next available period. Nothing is cancelled.
                </span>
              </span>
            </label>

            {form.unexpected && form.date && form.date >= todayISO() && (
              <div className="span-2 holiday-impact small">
                <CalendarClock size={15} />
                {impact} planned lesson(s) on this date will be extended.
              </div>
            )}

            <div className="span-2 actions">
              <button className="btn primary" onClick={save}>
                <Plus size={16} />
                {editing ? 'Update' : 'Add'} Holiday
              </button>
              {editing && (
                <button className="btn" onClick={resetForm}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Card>

        <Card title="Configured holidays">
          <div className="holiday-list">
            {sorted.map((h) => (
              <div className="holiday-row" key={h.id}>
                <div>
                  <div className="strong">
                    {h.name}
                    {h.unexpected && (
                      <span className="badge unexpected-badge" style={{ '--c': 'var(--st-rescheduled)' }}>
                        Unexpected
                      </span>
                    )}
                  </div>
                  <div className="small muted">
                    {h.date} Â· {h.description || 'No description'}
                  </div>
                  {h.movedCount > 0 && (
                    <div className="small muted">
                      {h.affectedCount} lesson(s) extended Â· {h.movedCount} period(s) shifted
                    </div>
                  )}
                </div>
                <div className="actions">
                  <button className="icon-btn" onClick={() => edit(h)} aria-label="Edit">
                    <Pencil size={15} />
                  </button>
                  <button className="icon-btn" onClick={() => remove(h)} aria-label="Delete">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Extend classes for this holiday?"
        subtitle={confirm ? `${confirm.holiday.name} Â· ${fmtLong(confirm.holiday.date)}` : ''}
        width={520}
        footer={
          <>
            <button className="btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button className="btn primary" onClick={confirmExtend}>
              Declare holiday &amp; extend
            </button>
          </>
        }
      >
        {confirm && (
          <div className="stack" style={{ gap: 10 }}>
            <p>
              <span className="strong">
                {confirm.impact} planned lesson{confirm.impact === 1 ? '' : 's'}
              </span>{' '}
              fall on this day.
            </p>
            <p className="muted small">
              Each lesson moves to the next timetable period of the same class and subject. Later lessons shift forward
              in order, and a planâ€™s end date is extended if needed. The original entries are kept in history, and
              teachers and HODs get a notification.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
