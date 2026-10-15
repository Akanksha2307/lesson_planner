import {
  readFeatureStore,
  updateFeatureStore,
  uid
} from '@/services/featureStore';

import {
  getHolidayImpact as calculateHolidayImpact,
  rescheduleLessonsForUnexpectedHoliday
} from '@/services/holidayScheduler';

const response = (data, message = 'OK') => ({
  success: true,
  data,
  message
});

export async function getHolidays() {
  return response(readFeatureStore().holidays || []);
}

export async function getHolidayImpact(date) {
  return response({ impact: calculateHolidayImpact(date) });
}

export async function saveHoliday(body) {
  const id = body.id || uid('hol');
  const holiday = { ...body, id };

  const previous = (readFeatureStore().holidays || [])
    .find(h => h.id === id);

  const shouldShift =
    holiday.unexpected &&
    holiday.date >= new Date().toISOString().slice(0, 10) &&
    (!previous ||
      previous.date !== holiday.date ||
      !previous.unexpected);

  updateFeatureStore(store => {
    const existing = store.holidays.find(h => h.id === id);

    if (existing) Object.assign(existing, holiday);
    else store.holidays.push(holiday);

    return store;
  });

  let shift = { affectedCount: 0, movedCount: 0 };

  if (shouldShift) {
    shift = rescheduleLessonsForUnexpectedHoliday(holiday);
  }

  updateFeatureStore(store => {
    const saved = store.holidays.find(h => h.id === id);

    if (saved) {
      saved.affectedCount = shift.affectedCount;
      saved.movedCount = shift.movedCount;
    }

    return store;
  });

  return response({
    ...holiday,
    ...shift,
    holiday
  }, 'Holiday saved');
}

export async function deleteHoliday(id) {
  updateFeatureStore(store => {
    store.holidays = store.holidays.filter(h => h.id !== id);
    return store;
  });

  return response({ id }, 'Holiday deleted');
}

export async function getExams() {
  return response(readFeatureStore().exams || []);
}

export async function saveExam(body) {
  const exam = { ...body, id: body.id || uid('exam') };

  updateFeatureStore(store => {
    const existing = store.exams.find(e => e.id === exam.id);

    if (existing) Object.assign(existing, exam);
    else store.exams.push(exam);

    return store;
  });

  return response(exam, 'Examination saved');
}

export async function deleteExam(id) {
  updateFeatureStore(store => {
    store.exams = store.exams.filter(e => e.id !== id);
    return store;
  });

  return response({ id }, 'Examination deleted');
}
