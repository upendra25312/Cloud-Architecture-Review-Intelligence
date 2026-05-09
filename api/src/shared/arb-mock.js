function buildMockReview(reviewId) {
  return {
    reviewId,
    projectName: "Sample ARB Review",
    customerName: "Contoso",
    workflowState: "Review In Progress",
    evidenceReadinessState: "Ready with Gaps",
    overallScore: 78,
    recommendation: "Needs Revision"
  };
}

function buildMockFindings(reviewId) {
  return [
    {
      findingId: "find-001",
      reviewId,
      severity: "High",
      domain: "Security",
      title: "Boundary control pattern not yet explicit",
      status: "Open"
    },
    {
      findingId: "find-002",
      reviewId,
      severity: "Medium",
      domain: "Operational Excellence",
      title: "Runbook ownership needs clarification",
      status: "Open"
    }
  ];
}

module.exports = {
  buildMockReview,
  buildMockFindings
};
