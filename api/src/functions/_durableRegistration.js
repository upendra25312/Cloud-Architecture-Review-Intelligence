'use strict';

/**
 * Durable Functions registration entrypoint.
 *
 * The Azure Functions Node.js v4 programming model registers functions by
 * evaluating modules matched by the `main` glob in package.json
 * (`src/functions/*.js`). Orchestrators and activities registered via
 * `df.app.orchestration()` / `df.app.activity()` live outside that glob
 * under `src/durable/`, so this file pulls them in by `require()` side
 * effect so the Functions host discovers them at startup.
 *
 * Keep this file minimal — it should only require durable modules.
 */

// Orchestrators
require('../durable/orchestratorAgentReview');
require('../durable/orchestratorExtraction');

// Activities (also required transitively by the orchestrators above, but
// listed explicitly here so every durable registration is visible in one
// place and survives any future orchestrator refactor).
require('../durable/activities/loadReviewData');
require('../durable/activities/runSearch');
require('../durable/activities/runRules');
require('../durable/activities/runAgent');
require('../durable/activities/persistResults');
require('../durable/activities/syncOutputs');
require('../durable/activities/writeArbJobStatus');
require('../durable/activities/checkDiQuota');
require('../durable/activities/loadFilesForExtraction');
require('../durable/activities/extractSingleFile');
require('../durable/activities/persistExtractionResults');
