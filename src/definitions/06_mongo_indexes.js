// Creating MongoDB indexes at startup. For now only the `users.email` unique
// index is needed (M1 step 2) — indexes for further collections will extend
// this list at the appropriate steps.
ON('ready', async function () {
    await MDB.ensureIndexes(process.env.MONGODB_DB_NAME, 'users', [
        { key: { email: 1 }, name: 'email_unique', unique: true },
        { key: { created: -1 }, name: 'created_idx' },
        { key: { status: 1 }, name: 'status_idx' }
    ]);

    await MDB.ensureIndexes(process.env.MONGODB_DB_NAME, 'diplomas', [
        { key: { status: 1 }, name: 'status_idx' },
        { key: { created: -1 }, name: 'created_idx' }
    ]);

    // Step 6 — Submission process (see controllers/submissions.js): the
    // diplomaId+userId pair is needed for the "does the user already have a
    // blocking submission for this diploma" check (upload_submission/view_new),
    // the userId+created pair for the list of the user's own submissions
    // (Submissions/Submissions query).
    await MDB.ensureIndexes(process.env.MONGODB_DB_NAME, 'submissions', [
        { key: { diplomaId: 1, userId: 1 }, name: 'diploma_user_idx' },
        { key: { userId: 1, created: -1 }, name: 'user_created_idx' }
    ]);
});
