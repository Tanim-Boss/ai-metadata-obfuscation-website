import { pgTable, serial, varchar, text, timestamp } from "drizzle-orm/pg-core";

export const processingJobs = pgTable("processing_jobs", {
  id: serial("id").primaryKey(),
  originalFilename: varchar("original_filename", { length: 255 }).notNull(),
  processedFilename: varchar("processed_filename", { length: 255 }).notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(), // 'image' or 'video'
  status: varchar("status", { length: 50 }).notNull().default("completed"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
