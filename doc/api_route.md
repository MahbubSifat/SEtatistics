# CP Student Tracker – Backend API Documentation

Frontend ডেভেলপারদের জন্য সহজ গাইড (Flask + SQLite backend)

## ১. শুরুর আগে যা জানতে হবে

- **Base URL:** `http://localhost:5000`
- সব API এর শুরু `/api/` দিয়ে।
- Data পাঠানো ও পাওয়া হয় **JSON** ফরম্যাটে (শুধু Excel upload ছাড়া)।
- Frontend অবশ্যই `http://localhost:3000` অথবা `http://localhost:5173` এ চালাতে হবে, নাহলে CORS error আসবে।
- সময় সবসময় **Dhaka time (Asia/Dhaka)**।
- Platform এর নাম (সবসময় ছোট হাতের অক্ষরে): `codeforces`, `leetcode`, `codechef`, `beecrowd`
- **beecrowd** এর username database এ সেভ হয়, কিন্তু sync হয় না (এখনো fetcher নেই)।

## ২. Login কীভাবে কাজ করে (সবচেয়ে গুরুত্বপূর্ণ)

এই backend **cookie-based session** ব্যবহার করে। Login করলে server একটি cookie দেয়, আর browser পরের প্রতিটি request এ সেটা নিজে থেকেই পাঠায়।

কিন্তু frontend থেকে request পাঠানোর সময় **credentials চালু রাখতেই হবে**, নাহলে cookie যাবে না এবং সব request এ `401` আসবে।

```javascript
// fetch ব্যবহার করলে
fetch("http://localhost:5000/api/students", { credentials: "include" });

// axios ব্যবহার করলে
axios.defaults.withCredentials = true;
```

**Default admin account** (প্রথমবার server চালালে নিজে তৈরি হয়):

- Email: `admin@example.com`
- Password: `admin123`

Login ছাড়া `/api/auth/login` বাদে আর কোনো API কাজ করবে না। না করলে `401` সহ এই response আসবে:

```json
{ "error": "Please log in first" }
```

## ৩. Error response এর ফরম্যাট

কোনো সমস্যা হলে সবসময় এই আকারে আসে:

```json
{ "error": "কী সমস্যা হয়েছে তার বার্তা" }
```

তাই frontend এ শুধু `data.error` দেখালেই হবে।

| Status code | মানে |
| --- | --- |
| 200 | সফল |
| 201 | নতুন কিছু তৈরি হয়েছে (student add) |
| 202 | কাজ শুরু হয়েছে, পেছনে চলছে (sync) |
| 400 | ভুল / অসম্পূর্ণ data পাঠানো হয়েছে |
| 401 | Login করা নেই, বা email/password ভুল |
| 404 | খুঁজে পাওয়া যায়নি |
| 409 | Conflict (যেমন student\_id আগেই আছে, বা sync আগে থেকেই চলছে) |

## ৪. সব API একনজরে

| Method | URL | কাজ |
| --- | --- | --- |
| POST | `/api/auth/login` | Login করা |
| POST | `/api/auth/logout` | Logout করা |
| GET | `/api/students` | সব student এর list (search সহ) |
| POST | `/api/students` | নতুন student যোগ করা |
| GET | `/api/students/<id>` | একজন student এর তথ্য |
| PUT | `/api/students/<id>` | Student এর তথ্য edit করা |
| DELETE | `/api/students/<id>` | Student delete করা |
| POST | `/api/students/excel/upload` | Excel upload করে preview দেখা |
| POST | `/api/students/excel/import` | Preview confirm করে import করা |
| POST | `/api/sync` | Platform থেকে data আনা শুরু করা |
| GET | `/api/sync/status` | Sync এর progress দেখা |
| GET | `/api/dashboard/summary` | Dashboard এর সারসংক্ষেপ |
| GET | `/api/students/<id>/statistics` | একজন student এর statistics |
| GET | `/api/leaderboard?period=...` | Leaderboard |

> **খেয়াল রাখুন:** URL এ `<id>` মানে database এর সংখ্যার `id` (যেমন 1, 2, 3), student এর roll/`student_id` নয়।

## ৫. Authentication API

### POST `/api/auth/login`

**Request body:**

```json
{ "email": "admin@example.com", "password": "admin123" }
```

**সফল হলে (200):**

```json
{
  "message": "Login successful",
  "user": { "id": 1, "name": "Admin", "email": "admin@example.com", "role": "admin" }
}
```

**ভুল হলে (401):** `{ "error": "Wrong email or password" }`

### POST `/api/auth/logout`

Body লাগে না। সফল হলে: `{ "message": "Logged out" }`

## ৬. Student API

একজন student এর object দেখতে এরকম:

```json
{
  "id": 1,
  "student_id": "2023001",
  "name": "Rahim",
  "batch": "10",
  "email": "rahim@example.com",
  "codeforces_id": "rahim_cf",
  "leetcode_id": "rahim_lc",
  "codechef_id": "",
  "beecrowd_id": ""
}
```

- `id` = database এর নম্বর (URL এ এটাই ব্যবহার হয়)
- `student_id` = student এর নিজের roll/ID
- Platform এ account না থাকলে ওই field এ খালি string `""` থাকে।

### GET `/api/students`

সব student এর array ফেরত দেয় (নাম অনুযায়ী সাজানো)।

Search করতে চাইলে (নাম বা student\_id দিয়ে):

```
GET /api/students?search=rahim
```

### POST `/api/students`

**Request body:**

```json
{
  "student_id": "2023001",
  "name": "Rahim",
  "batch": "10",
  "email": "rahim@example.com",
  "codeforces_id": "rahim_cf",
  "leetcode_id": "rahim_lc"
}
```

- **আবশ্যক:** `student_id`, `name`, `batch`, `email`
- **ঐচ্ছিক:** `codeforces_id`, `leetcode_id`, `codechef_id`, `beecrowd_id`
- সফল হলে `201` এবং নতুন student object ফেরত আসে।
- কোনো আবশ্যক field না থাকলে `400` → `{ "error": "'name' is required" }`
- `student_id` আগেই থাকলে `409` → `{ "error": "This student_id already exists" }`

### GET `/api/students/<id>`

একজন student এর object ফেরত দেয়। না পেলে `404`।

### PUT `/api/students/<id>`

শুধু যে field বদলাতে চান সেগুলোই পাঠান। না পাঠালে আগের মান থেকে যাবে।

```json
{ "name": "Rahim Uddin", "leetcode_id": "new_lc_name" }
```

Platform ID নিয়ে নিয়ম:

- Key পাঠালে এবং মান **খালি** (`""`) হলে → ওই platform account **মুছে যাবে**।
- Username **বদলালে** → পুরোনো account ও তার সব solved problem **মুছে যায়**, নতুন account তৈরি হয়। তারপর আবার Sync করতে হবে।
- Key না পাঠালে → ওই platform এ কিছুই বদলায় না।

সফল হলে আপডেট হওয়া student object ফেরত আসে।

### DELETE `/api/students/<id>`

সফল হলে: `{ "message": "Student deleted" }`। Student এর account ও solved problem ও সাথে মুছে যায়।

## ৭. Excel দিয়ে অনেক student একসাথে যোগ করা

এটা **দুই ধাপের** কাজ: আগে upload করে preview দেখা, তারপর confirm করে import করা।

### Excel ফাইলের নিয়ম

- ফাইল অবশ্যই `.xlsx` হতে হবে।
- প্রথম row হলো column এর নাম। বড় হাতের অক্ষর ও space নিজে ঠিক হয়ে যায় (যেমন `Student ID` → `student_id`)।
- আবশ্যক column: `student_id`, `name`, `batch`, `email`
- ঐচ্ছিক column: `codeforces_id`, `leetcode_id`, `codechef_id`, `beecrowd_id`

### ধাপ ১: POST `/api/students/excel/upload`

এটা JSON নয়, **multipart/form-data**। ফাইলের field এর নাম হবে `file`।

```javascript
const form = new FormData();
form.append("file", fileInput.files[0]);

const res = await fetch("http://localhost:5000/api/students/excel/upload", {
  method: "POST",
  credentials: "include",
  body: form, // Content-Type নিজে সেট করবেন না
});
const data = await res.json();
```

**Response:**

```json
{
  "import_id": "a1b2c3d4...",
  "total_rows": 3,
  "valid_count": 2,
  "error_count": 1,
  "rows": [
    { "row": 2, "data": { "student_id": "2023001", "name": "Rahim", "...": "..." }, "errors": [] },
    { "row": 3, "data": { "student_id": "2023002", "name": "", "...": "..." }, "errors": ["name is missing"] }
  ]
}
```

- `rows` দিয়ে একটা preview table দেখান। যেসব row তে `errors` খালি নয় সেগুলো লাল করে দেখাতে পারেন।
- **এই ধাপে কিছু database এ সেভ হয় না।**
- সম্ভাব্য error: `Missing required column(s): ...`, `Please upload an .xlsx Excel file`, `The Excel file is empty`

### ধাপ ২: POST `/api/students/excel/import`

User "Confirm" চাপলে ধাপ ১ এর `import_id` পাঠান:

```json
{ "import_id": "a1b2c3d4..." }
```

**Response:**

```json
{ "message": "Import finished", "imported": 2, "skipped": 0 }
```

শুধু **valid row** গুলোই import হয়, error ওয়ালা row বাদ যায়। Server restart হয়ে গেলে বা `import_id` ভুল হলে `404` আসে, তখন আবার upload করতে হবে।

## ৮. Sync: Platform থেকে data আনা

Sync মানে Codeforces / LeetCode / CodeChef থেকে প্রতিটি student এর মোট solved সংখ্যা আনা। এটা ধীর, তাই পেছনে (background এ) চলে।

### POST `/api/sync`

Body লাগে না। সাথে সাথে `202` ফেরত দেয়:

```json
{ "message": "Sync started. Check progress at GET /api/sync/status" }
```

আগের sync চলতে থাকলে `409` → `{ "error": "A sync is already running" }`

### GET `/api/sync/status`

```json
{
  "running": true,
  "total": 40,
  "done": 12,
  "failed": ["2023005 / leetcode: Not Found"],
  "started_at": "2026-11-12 10:00:00",
  "finished_at": null
}
```

| Field | মানে |
| --- | --- |
| `running` | এখনো চলছে কি না |
| `total` | মোট কয়টা account sync হবে |
| `done` | কয়টা শেষ হয়েছে |
| `failed` | যেগুলো fail করেছে তার তালিকা (কে, কোন platform, কেন) |
| `started_at` / `finished_at` | শুরু ও শেষের সময় |

**Frontend এ কীভাবে করবেন:**

1. "Sync" button চাপলে `POST /api/sync` পাঠান।
2. প্রতি ২ সেকেন্ড পরপর `GET /api/sync/status` ডাকুন।
3. Progress bar = `done / total`।
4. `running` `false` হলে polling বন্ধ করুন, `failed` এ কিছু থাকলে user কে দেখান।
5. তারপর dashboard / leaderboard নতুন করে load করুন।

## ৯. Dashboard

### GET `/api/dashboard/summary`

```json
{
  "total_students": 40,
  "total_solved": 1520,
  "today_solved": 12,
  "leaderboard": [ /* সেরা ১০ জন, leaderboard row এর মতো */ ]
}
```

- `total_solved` = সব student এর সব platform মিলিয়ে মোট solved
- `today_solved` = আজ (Dhaka সময়ে রাত ১২টা থেকে) কতগুলো solve হয়েছে
- `leaderboard` = all-time ভিত্তিতে সেরা ১০ জন

## ১০. একজন Student এর Statistics

### GET `/api/students/<id>/statistics`

```json
{
  "student": { "id": 1, "student_id": "2023001", "name": "Rahim", "batch": "10" },
  "total_solved": 150,
  "periods": {
    "last-day": 2,
    "last-week": 9,
    "last-month": 30,
    "all-time": 150
  },
  "by_platform": {
    "codeforces": 100,
    "leetcode": 50,
    "codechef": 0,
    "beecrowd": 0
  }
}
```

`periods` দিয়ে সময়ভিত্তিক chart, আর `by_platform` দিয়ে platform ভিত্তিক pie/bar chart বানানো যায়। Student না পেলে `404`।

## ১১. Leaderboard

### GET `/api/leaderboard?period=...`

`period` এর মান চারটির একটি: `last-day`, `last-week`, `last-month`, `all-time` (না দিলে `all-time`)। ভুল দিলে `400`।

```json
{
  "period": "last-week",
  "rows": [
    {
      "rank": 1,
      "id": 1,
      "student_id": "2023001",
      "name": "Rahim",
      "batch": "10",
      "total_solved": 150,
      "period_solved": 9,
      "by_platform": { "codeforces": 100, "leetcode": 50, "codechef": 0, "beecrowd": 0 },
      "top_in": ["codeforces"]
    }
  ]
}
```

| Field | মানে |
| --- | --- |
| `rank` | অবস্থান (১ থেকে শুরু) |
| `period_solved` | নির্বাচিত সময়ে কতগুলো solve করেছে (ranking এটার উপর) |
| `total_solved` | সব সময়ের মোট (দুজনের `period_solved` সমান হলে এটা দিয়ে tie ভাঙে) |
| `by_platform` | প্রতিটি platform এ মোট কয়টি |
| `top_in` | যে যে platform এ এই student সবার সেরা, সেগুলোর নাম (badge/তারকা দেখাতে পারেন) |

### সময়ের হিসাব

| period | কোন সময়ের data |
| --- | --- |
| `last-day` | আজ রাত ১২টা থেকে এখন পর্যন্ত |
| `last-week` | গত ৭ দিন |
| `last-month` | গত ৩০ দিন |
| `all-time` | সব |

## ১২. Frontend এ ব্যবহারের নমুনা code

একটা ছোট helper বানিয়ে নিলে সব জায়গায় সহজে কাজ করে:

```javascript
const BASE = "http://localhost:5000";

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    credentials: "include", // cookie পাঠানোর জন্য, ভোলা যাবে না
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "কিছু একটা ভুল হয়েছে");
  }
  return data;
}

// Login
await api("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email: "admin@example.com", password: "admin123" }),
});

// Student list
const students = await api("/api/students?search=rahim");

// নতুন student
await api("/api/students", {
  method: "POST",
  body: JSON.stringify({ student_id: "2023001", name: "Rahim", batch: "10", email: "r@x.com" }),
});

// Leaderboard
const lb = await api("/api/leaderboard?period=last-week");
```

> Excel upload এর সময় `Content-Type: application/json` header দেওয়া যাবে না। FormData এর ক্ষেত্রে browser নিজেই ঠিক header বসায়।

## ১৩. মনে রাখার বিষয় (এগুলো না জানলে বিভ্রান্তি হবে)

1. **প্রথম sync এ daily/weekly সবসময় ০ দেখাবে।** Platform শুধু মোট সংখ্যা দেয়, প্রতিটি problem এর তারিখ দেয় না। তাই প্রথম sync এ পুরোনো সব problem "আগে solve করা" হিসেবে ধরা হয় (কোনো সময় থাকে না), শুধু `all-time` এ গোনা হয়। পরের sync এ মোট সংখ্যা বাড়লে শুধু বাড়তি problem গুলো "এখন solve করা" ধরা হয়, তখনই day/week/month এ আসে। অর্থাৎ নিয়মিত sync করতে হবে।
2. **Login অবস্থা জানার জন্য আলাদা API নেই** (যেমন `/api/auth/me`)। Page refresh করলে frontend এ user এর অবস্থা হারিয়ে গেলে কোনো protected API ডেকে `401` এলে login page এ পাঠিয়ে দিন।
3. **ID দুই রকম:** `id` (database এর নম্বর, URL এ লাগে) আর `student_id` (roll)। গুলিয়ে ফেলবেন না।
4. **Platform ID বদলালে** পুরোনো solved data মুছে যায়, আবার sync করতে হবে।
5. **Beecrowd** এর username রাখা যায়, কিন্তু solved সংখ্যা সবসময় ০ থাকবে কারণ sync নেই।
6. **Sync এর অবস্থা memory তে থাকে**, server restart দিলে `/api/sync/status` রিসেট হয়ে যায়। Excel এর `import_id` ও একইভাবে হারিয়ে যায়।
7. **একসাথে একটাই sync** চলে। চলার সময় আবার চাপলে `409` আসবে, button disable করে রাখা ভালো।
8. **Cookie না যাওয়ার সমস্যা** হলে আগে দেখুন: `credentials: "include"` / `withCredentials: true` দিয়েছেন কি না, এবং frontend এর port `3000` বা `5173` কি না।