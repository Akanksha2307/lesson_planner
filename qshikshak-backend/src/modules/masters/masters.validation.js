import { z } from 'zod';

// PUT /settings – send only the settings you want to change
export const settingsBody = z
  .object({
    approvalRequired: z.boolean(),
    approver: z.enum(['hod', 'principal']),
    submissionDay: z.string().trim().max(20),
    dailyReminderTime: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM, for example 18:00'),
    autoShift: z.boolean(),
    skipHolidays: z.boolean(),
    skipExams: z.boolean(),
    whatsappHomework: z.boolean(),
    editAfterApproval: z.enum(['reapprove', 'allow']),
    principalAfterDays: z.number().int().min(0).max(30),
  })
  .partial();

// PUT /templates/:id
export const templateBody = z.object({
  name: z.string().trim().min(1, 'Template name cannot be empty').max(100),
  board: z.string().trim().max(50).optional(),
  isDefault: z.boolean().optional(),
  fields: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(50),
        label: z.string().trim().min(1, 'Every field needs a label').max(100),
        type: z.string().trim().min(1).max(30),
        enabled: z.boolean().default(true),
        required: z.boolean().default(false),
      }),
    )
    .max(50),
});