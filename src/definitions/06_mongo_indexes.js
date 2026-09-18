// MongoDB indexek létrehozása induláskor. Egyelőre csak a `users.email` egyedi
// index kell (M1 2. lépés) — a további kollekciók indexei a megfelelő lépéseknél
// bővítik ezt a listát.
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

    // 6. lépés — Beadási folyamat (lásd controllers/submissions.js): a
    // diplomaId+userId pár a "van-e már blokkoló beadványa ehhez a diplomához"
    // ellenőrzéshez kell (upload_submission/view_new), a userId+created a saját
    // beadványok listájához (Submissions/Submissions query).
    await MDB.ensureIndexes(process.env.MONGODB_DB_NAME, 'submissions', [
        { key: { diplomaId: 1, userId: 1 }, name: 'diploma_user_idx' },
        { key: { userId: 1, created: -1 }, name: 'user_created_idx' }
    ]);
});
