# Secure Examination Management System (Web-e-Thon, Technoverse 5.0)

Full-stack exam platform: Next.js 16 (App Router, TypeScript, Tailwind 4) + PostgreSQL 16 + Prisma 7.

## Setup

```bash
# 1. Database (any Postgres 16 works; this is the local docker one)
docker run -d --name webethon-pg -e POSTGRES_USER=webethon -e POSTGRES_PASSWORD=webethon_dev \
  -e POSTGRES_DB=webethon -p 127.0.0.1:5444:5432 postgres:16

# 2. App
cp .env.example .env
npm install            # also generates the Prisma client
npm run db:deploy      # apply migrations (tables + DB rules)
npm run db:seed        # demo data
npm run dev
```

## Test credentials
All accounts use password `Password@123`.

| Role | Email |
|---|---|
| Admin | admin@exam.test |
| Examiner | examiner@exam.test |
| Candidate | candidate1@exam.test |

## Docs
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables, business rules, edge cases
- [docs/AUTH.md](docs/AUTH.md): signup/login rules, sessions, temporary passwords, auth API
- [docs/QUESTION_BANK.md](docs/QUESTION_BANK.md): question bank rules, permissions, CSV/JSON import
- [docs/EXAMS.md](docs/EXAMS.md): exam builder, lifecycle, publish checklist, enrollment
