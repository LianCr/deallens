"use client";

import { useState } from "react";
import { AnalyzerForm } from "./AnalyzerForm";
import { ResearchReportView } from "./ResearchReportView";
import styles from "./ResearchClient.module.css";

export function ResearchClient() {
  const [payload, setPayload] = useState<unknown>(null);

  return (
    <div className={styles.stack}>
      <AnalyzerForm onResult={setPayload} />
      {payload != null && <ResearchReportView payload={payload} />}
    </div>
  );
}
