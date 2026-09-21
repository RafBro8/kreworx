import { model, Schema, type InferSchemaType } from "mongoose";

export const JOB_STATUSES = [
  "unscheduled",
  "scheduled",
  "en_route",
  "on_site",
  "awaiting_approval",
  "parts_on_order",
  "done",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

const timelineEntrySchema = new Schema(
  {
    status: { type: String, enum: JOB_STATUSES, required: true },
    at: { type: Date, required: true },
  },
  { _id: false },
);

const jobSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    number: { type: Number, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: "Property", required: true },
    crewId: { type: Schema.Types.ObjectId, ref: "Crew", default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    priority: { type: String, enum: ["normal", "high", "urgent"], default: "normal" },
    status: { type: String, enum: JOB_STATUSES, required: true },
    scheduledStart: { type: Date, default: null },
    scheduledEnd: { type: Date, default: null },
    estimatedMinutes: { type: Number, required: true, min: 0 },
    // Free text a dispatcher wrote when the job came in, like "customer
    // flexible" or "due this week". Only meaningful while unscheduled.
    schedulingNote: { type: String, trim: true },
    requestedAt: { type: Date, required: true },
    // The customer's private link. Long and random, because it is the only
    // thing standing between the internet and the details of this job.
    portalToken: { type: String, required: true, unique: true },
    timeline: [timelineEntrySchema],
    // Set when a person changes a job, so the demo simulator stops walking
    // that one forward and leaves their change standing.
    manualOverride: { type: Boolean, default: false },
  },
  { timestamps: true },
);

jobSchema.index({ companyId: 1, number: 1 }, { unique: true });
jobSchema.index({ companyId: 1, scheduledStart: 1 });
jobSchema.index({ companyId: 1, status: 1 });

jobSchema.pre("validate", function () {
  const hasStart = this.scheduledStart != null;
  const hasEnd = this.scheduledEnd != null;
  if (hasStart !== hasEnd) {
    this.invalidate("scheduledEnd", "A scheduled job needs both a start and an end");
  }
  if (hasStart && hasEnd && this.scheduledEnd! <= this.scheduledStart!) {
    this.invalidate("scheduledEnd", "A job has to end after it starts");
  }
  if (this.status === "unscheduled" && hasStart) {
    this.invalidate("status", "An unscheduled job cannot have a time");
  }
});

export type JobDoc = InferSchemaType<typeof jobSchema>;
export const Job = model("Job", jobSchema);
