<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ yarn install
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Auth API

Base URL: `http://localhost:3000` (or `PORT` from `.env`).

### Sign up — `POST /auth/signup`

Request body:

```json
{
  "name": "Test User",
  "email": "test@example.com",
  "password": "supersecret123"
}
```

Success response (`201`):

```json
{
  "id": 1,
  "name": "Test User",
  "email": "test@example.com"
}
```

`passwordHash` is never returned. If the email is already registered, the response is `409 Conflict`:

```json
{
  "statusCode": 409,
  "message": "Email is already in use"
}
```

### Sign in — `POST /auth/signin`

Request body:

```json
{
  "email": "test@example.com",
  "password": "supersecret123"
}
```

Success response (`200`):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

If the email or password is invalid, the response is `401 Unauthorized` (same message for both cases, to avoid revealing which field was wrong):

```json
{
  "statusCode": 401,
  "message": "Invalid email or password"
}
```

## Dictionary API

All endpoints require an `Authorization: Bearer <accessToken>` header (the token from `POST /auth/signin`).

### Look up word suggestions — `GET /words?value=apple`

Searches the global word database (independent of any user's dictionary) so the frontend can suggest existing definitions/translations while the user types.

Response when the word exists (`200`):

```json
{
  "wordId": 1,
  "word": "apple",
  "definitions": ["a round fruit with red or green skin"],
  "translations": ["яблуко"]
}
```

Response when the word does not exist yet: `null`.

### Add a word to my dictionary — `POST /dictionary`

Request body:

```json
{
  "value": "apple",
  "definitions": ["a round fruit with red or green skin"],
  "translations": ["яблуко"]
}
```

At least one definition and one translation are required, otherwise `400 Bad Request`. If the word already exists globally, it's reused; new definitions/translations are added to it.

Response (`201`):

```json
{
  "wordId": 1
}
```

### Get my dictionary — `GET /dictionary`

Query params (all optional):

- `page`, `pageSize`, `search`, `ids` (comma-separated word ids)
- `sort` — `percentage_asc` (worst learned first) or `percentage_desc` (best learned first). Without it, results are sorted alphabetically.
- `filter` — `not_learned` (`0%`), `poor` (`1–39%`), `average` (`40–99%`), `learned` (`100%`)

Response (`200`):

```json
{
  "data": [
    {
      "wordId": 1,
      "word": "apple",
      "definitions": ["a round fruit with red or green skin"],
      "translations": ["яблуко"],
      "percentage": 40
    }
  ],
  "total": 1,
  "pages": 1,
  "page": 1
}
```

`percentage` is how well the user knows this word (`0–100`), based on `POST /statistics/attempts` — see the [Statistics API](#statistics-api).

### Edit a word in my dictionary — `PATCH /dictionary/:wordId`

Request body:

```json
{
  "definitions": ["a round fruit with red or green skin"],
  "translations": ["яблуко", "плід яблуні"]
}
```

Replaces the full set of definitions/translations linked to this word in the user's dictionary — pairs no longer present are removed, new ones are added. At least one of each is required. Returns `404 Not Found` if the word isn't in the user's dictionary.

### Remove a word from my dictionary — `DELETE /dictionary/:wordId`

Removes the word from the user's dictionary entirely. Returns `404 Not Found` if it wasn't there. The global word/definitions/translations records are kept (other users may still have them in their dictionaries).

## Statistics API

All endpoints require an `Authorization: Bearer <accessToken>` header.

### Record a practice attempt — `POST /statistics/attempts`

Request body:

```json
{
  "wordId": 1,
  "isCorrect": true
}
```

Progress for this word (and the user's overall stats) are created lazily on the first attempt. A correct attempt increments `correctCount` (and the user's `totalScore` — see [Leaderboard API](#leaderboard-api)); an incorrect one decrements `correctCount` (never below `0`) and increments `incorrectCount`. `percentage` is driven only by `correctCount`.

The user's streak (`currentStreak`) is updated based on the gap since the last attempt (any word): same day → unchanged, exactly one day → `+1`, more than one day → reset to `1`. `longestStreak` tracks the best `currentStreak` ever reached.

Response (`201`):

```json
{
  "wordId": 1,
  "correctCount": 1,
  "incorrectCount": 0,
  "percentage": 1
}
```

`percentage` is `min(100, round(correctCount / repetitionsTarget * 100))`. `repetitionsTarget` defaults to `100` (how many correct repetitions count as fully learned) — a future account-settings feature will let users change it to `50` or `150`.

### Get my statistics — `GET /statistics`

Response (`200`):

```json
{
  "repetitionsTarget": 100,
  "currentStreak": 3,
  "longestStreak": 5,
  "lastPracticedAt": "2024-01-15T12:00:00.000Z",
  "words": [
    { "wordId": 2, "correctCount": 10, "incorrectCount": 5, "lastPracticedAt": "2024-01-15T12:00:00.000Z", "percentage": 10 },
    { "wordId": 1, "correctCount": 80, "incorrectCount": 1, "lastPracticedAt": "2024-01-15T12:00:00.000Z", "percentage": 80 }
  ]
}
```

`words` is sorted by `percentage` ascending (worst-known words first).

## Leaderboard API

### Get the leaderboard — `GET /leaderboard`

Requires an `Authorization: Bearer <accessToken>` header. Returns every user ranked by `totalScore` (descending) — one point per correct practice attempt, across all words and all time.

Response (`200`):

```json
[
  { "rank": 1, "name": "Top User", "totalScore": 50 },
  { "rank": 2, "name": "Mid User", "totalScore": 20 }
]
```

## Practice API

All endpoints require an `Authorization: Bearer <accessToken>` header. The correct answer is never sent to the frontend ahead of time — every submission is verified server-side.

### Start a practice session — `GET /practice/session`

Query param `filter` (optional): `not_learned`, `poor`, `average`, `learned` (same buckets as [Dictionary API](#dictionary-api)), or `random` (no filter, still random). Without `filter`, behaves the same as `random`.

Returns 10 random words from the user's dictionary (with all their definitions and translations), matching the filter if given. Distractors for all four exercise types should be built from this same batch of 10 words — not the wider dictionary or global database.

Response (`200`):

```json
[
  {
    "wordId": 1,
    "word": "bank",
    "definitions": ["a financial institution that holds money", "the land alongside a river"],
    "translations": ["банк", "берег"]
  }
]
```

### Submit an answer — `POST /practice/verify`

Request body shape depends on the exercise `type`:

```json
// choose_translation — pick the right translation out of 4 options
{ "wordId": 1, "type": "choose_translation", "answer": "банк" }

// match_definition — pair a word with one of its definitions
{ "wordId": 1, "type": "match_definition", "answer": 5 }

// type_word — type the English word from its definitions/translations
{ "wordId": 1, "type": "type_word", "answer": "bank" }

// select_all_translations — pick every correct translation from a shuffled pool
{ "wordId": 1, "type": "select_all_translations", "answer": ["банк", "берег"] }
```

`answer` for `match_definition` is a `definitionId` (number); for `select_all_translations` it's the full set of chosen translation strings and must match the word's real translations exactly (nothing missing, nothing extra) to count as correct.

Every submission is recorded via the same logic as `POST /statistics/attempts` (`correctCount`/`totalScore` updates, streak, etc.) — the caller doesn't need to call that endpoint separately.

Response (`201`):

```json
{ "isCorrect": true }
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
