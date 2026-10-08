import "dotenv/config";

// Los tests de integración usan una base separada (pyr_test).
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
