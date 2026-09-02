import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { auditRouter } from './modules/audit/index.js';
import { intakeRouter } from './modules/intake/index.js';
import { registryRouter } from './modules/registry/index.js';
import { HttpError } from './shared/httpError.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', intakeRouter);
app.use('/api', registryRouter);
app.use('/api', auditRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`RPT Governance API listening on :${port}`);
});
