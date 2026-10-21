import { z } from "zod";

const objectiveSchema = z.object({
  text: z.string().trim().min(1),
  result: z.enum(["yes", "partly", "no"])
});

export const completeItemBody = z.object({
  status: z.enum([
    "completed",
    "partial",
    "not_done"
  ]),

  topicsCovered: z.array(z.string()).default([]),

  objectives: z.array(objectiveSchema).default([]),

  understanding: z.string().default(""),

  remarks: z.string().default(""),

  nextLesson: z.string().default(""),

  sendHomework: z.boolean().default(false)
}).superRefine((data, ctx) => {

  if (
    data.status !== "not_done" &&
    !data.understanding.trim()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["understanding"],
      message: "Select the students' understanding level."
    });
  }

  if (
    data.status === "not_done" &&
    !data.remarks.trim()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["remarks"],
      message: "Add a reason when a lesson is not done."
    });
  }

});

export type CompleteItemBody = z.infer<typeof completeItemBody>;
