# CP Student Tracker – Backend API Documentation (v2)

Frontend ডেভেলপারদের জন্য গাইড (Flask + SQLite backend)

---

## ০. আগের version থেকে কী কী বদলেছে

| বিষয় | আগে | এখন |
| --- | --- | --- |
| Period | `last-day`, `last-week`, `last-month`, `all-time` | `this-day`, `last-3-days`, `last-week`, `last-month`, `all-time` (`last-day` দিলেও চলবে, `this-day` ধরা হবে) |
| History | প্রতিটা problem এর জন্য আলাদা নকল row | প্রতিদিন প্রতিটা account এর **একটা snapshot** (দ্রুত, ছোট database) |
| Leaderboard | শুধু নির্বাচিত period এর সংখ্যা | **সব period একসাথে** + growth + medal + special role + platform rating |
| Student এর তথ্য | name, batch, email | + `department`, `avatar_url`, `github_url`, `linkedin_url`, `special_role` |
| Role | `admin` / `teacher` | **`admin`** আর **`developer`**। শুধু এরাই login করে, আর student / Excel / sync এর সব change এরাই করতে পারে। Login account বানানো / মোছা শুধু admin |
| নিজের profile | ছিল না | Login করা user নিজের leaderboard profile (ছবি, link, platform username) নিজে edit করতে পারে। Admin চাইলে profile না-ও রাখতে পারে |
| Daily sync | হাতে চাপতে হতো | **প্রতিদিন রাত ১১:৫৯ (Dhaka) এ automatic** |
| Login অবস্থা জানা | উপায় ছিল না | `GET /api/auth/me` |
| Password | বদলানো যেত না | `POST /api/auth/change-password` |
| Log | ছিল না | কে কী করেছে সব `activity_logs` এ, `GET /api/logs` |
| Sync status | memory তে (restart এ হারাতো) | database এ, restart এ হারায় না |
| Excel import_id | memory তে | database এ (২ ঘণ্টা valid) |
| Beecrowd | sync হতো না | local machine থেকে signed POST দিয়ে আসে |
| Public দেখা | সব কিছুতে login লাগত | leaderboard, profile, graph, dashboard **login ছাড়াই** দেখা যায়, কিন্তু কিছু বদলাতে login লাগে |

---

## ১. শুরুর আগে যা জানতে হবে

- **Base URL (local):** `http://localhost:5000` — deploy এর পর `https://<username>.pythonanywhere.com`
- সব API এর শুরু `/api/` দিয়ে।
- Data পাঠানো ও পাওয়া হয় **JSON** এ (শুধু Excel upload `multipart/form-data`)।
- Frontend local এ `http://localhost:3000` বা `http://localhost:5173` এ চালাতে হবে (অন্য origin লাগলে backend এর `.env` এ `FRONTEND_ORIGINS` এ যোগ করতে হবে)।
- সময় সবসময় **Dhaka time (Asia/Dhaka)**, ফরম্যাট `YYYY-MM-DD HH:MM:SS`, তারিখ `YYYY-MM-DD`।
- Platform এর নাম (সবসময় ছোট হাতে): `codeforces`, `leetcode`, `codechef`, `beecrowd`
- Period এর নাম: `this-day`, `last-3-days`, `last-week`, `last-month`, `all-time`
- বড় JSON (যেমন leaderboard) **gzip** হয়ে আসে। Browser নিজেই খুলে নেয়, frontend এ কিছু করতে হবে না।

### API তিন ধরনের

| ধরন | কে ব্যবহার করে | Auth |
| --- | --- | --- |
| **Public** | যে কেউ (leaderboard, profile, graph) | লাগে না (`PUBLIC_READ=1`)। `PUBLIC_READ=0` করলে login লাগবে |
| **Staff** | Login করা `admin` বা `developer` (student add/edit, Excel, sync, নিজের profile) | Cookie session |
| **Admin** | শুধু `admin` (login account বানানো / role বদলানো / মোছা / password reset, সবার log) | Cookie session + role `admin` |
| **Agent** | Local machine এর beecrowd script | HMAC signature header |

Public API তে student এর **email কখনো আসে না**। Email শুধু staff API তে।

---

## ২. Login কীভাবে কাজ করে

এই backend **cookie-based session** ব্যবহার করে। Login করলে server একটা cookie দেয়, browser পরের প্রতিটা request এ সেটা নিজেই পাঠায়। Session ৭ দিন থাকে (`SESSION_DAYS`)।

Frontend থেকে request পাঠানোর সময় **credentials চালু রাখতেই হবে**, নাহলে cookie যাবে না আর staff API তে `401` আসবে:

```javascript
fetch("http://localhost:5000/api/students", { credentials: "include" }); // fetch
axios.defaults.withCredentials = true;                                     // axios
```

**কে login করে:** শুধু `admin` আর `developer`। সাধারণ student দের login লাগে না, তারা leaderboard আর profile public ভাবেই দেখে।

| কাজ | Public | Developer | Admin |
| --- | --- | --- | --- |
| Leaderboard, profile, graph দেখা | ✓ | ✓ | ✓ |
| Student যোগ / edit / delete, Excel import, Sync | ✗ | ✓ | ✓ |
| নিজের profile edit, নিজের password বদল | ✗ | ✓ | ✓ |
| নিজের log দেখা | ✗ | ✓ | ✓ |
| সবার log দেখা | ✗ | ✗ | ✓ |
| Login account বানানো / role বদল / মোছা / password reset | ✗ | ✗ | ✓ |

**প্রথম account (admin)** (database এ কোনো user না থাকলে নিজে তৈরি হয়):

- Email: `admin@example.com` (বা `.env` এর `FIRST_USER_EMAIL`)
- Password: `admin123` (বা `.env` এর `FIRST_USER_PASSWORD`)
- **প্রথম login এর পরই password বদলে নিন।**

Login না থাকলে staff API তে:

```json
{ "error": "Please log in first" }
```

**Page refresh হলে:** app শুরুতেই `GET /api/auth/me` ডাকুন। `200` এলে user logged in, `401` এলে login page।

---

## ৩. Error response এর ফরম্যাট

সমস্যা হলে সবসময় এই আকারে আসে:

```json
{ "error": "কী সমস্যা হয়েছে তার বার্তা" }
```

Validation এ একাধিক সমস্যা থাকলে সাথে `errors` list ও আসে:

```json
{ "error": "'name' is required", "errors": ["'name' is required", "email is not valid"] }
```

| Status | মানে |
| --- | --- |
| 200 | সফল |
| 201 | নতুন কিছু তৈরি হয়েছে (student / staff) |
| 202 | কাজ শুরু / queue তে রাখা হয়েছে (sync) |
| 400 | ভুল বা অসম্পূর্ণ data |
| 401 | Login নেই, email/password ভুল, বা agent এর signature ভুল |
| 403 | Login আছে কিন্তু অনুমতি নেই (developer হয়ে admin এর কাজ) |
| 404 | খুঁজে পাওয়া যায়নি |
| 409 | Conflict (student_id আগেই আছে, sync আগে থেকেই চলছে) |
| 413 | ফাইল ৫ MB এর বেশি |
| 429 | ১৫ মিনিটে ১০ বার ভুল password → কিছুক্ষণ অপেক্ষা |
| 500 | Server এর ভেতরের সমস্যা |
| 503 | Beecrowd ingest বন্ধ (`INGEST_SECRET` সেট করা নেই) |

---

## ৪. সব API একনজরে

| Method | URL | Auth | কাজ |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | – | Login |
| POST | `/api/auth/logout` | – | Logout |
| GET | `/api/auth/me` | Staff | কে login করা আছে + নিজের profile |
| PUT | `/api/auth/me` | Staff | নিজের নাম বদলানো |
| PUT | `/api/auth/me/profile` | Staff | নিজের leaderboard profile তৈরি / edit |
| DELETE | `/api/auth/me/profile` | Staff | নিজেকে leaderboard থেকে সরানো |
| POST | `/api/auth/change-password` | Staff | নিজের password বদলানো |
| GET | `/api/users` | Staff | সব login account এর list |
| POST | `/api/users` | Admin | নতুন admin / developer account |
| PUT | `/api/users/<id>` | Admin | নাম / role / student link বদল |
| POST | `/api/users/<id>/reset-password` | Admin | কারো password reset |
| DELETE | `/api/users/<id>` | Admin | Login account মোছা |
| GET | `/api/logs` | Staff | Activity log (admin সবার, developer নিজের) |
| GET | `/api/students` | Staff | সব student (search / batch / department filter) |
| POST | `/api/students` | Staff | নতুন student |
| GET | `/api/students/<id>` | Staff | একজন student (email সহ) |
| PUT | `/api/students/<id>` | Staff | Student edit |
| DELETE | `/api/students/<id>` | Staff | Student delete |
| GET | `/api/students/excel/template` | Staff | খালি Excel template download |
| POST | `/api/students/excel/upload` | Staff | Excel upload → preview |
| POST | `/api/students/excel/import` | Staff | Preview confirm → save |
| POST | `/api/sync` | Staff | Codeforces/LeetCode/CodeChef sync শুরু |
| GET | `/api/sync/status` | Staff | শেষ sync এর progress |
| GET | `/api/sync/runs` | Staff | আগের sync গুলোর তালিকা |
| GET | `/api/leaderboard` | Public | Leaderboard (সব period একসাথে) |
| GET | `/api/students/<id>/profile` | Public | Profile page এর সব তথ্য + #1 student |
| GET | `/api/students/<id>/history` | Public | Graph এর daily data + #1 student এর data |
| GET | `/api/dashboard/summary` | Public | সারসংক্ষেপ + top 10 |
| GET | `/api/meta` | Public | Platform / period / sort এর নামগুলো |
| GET | `/api/ingest/beecrowd/usernames` | Agent | Beecrowd ID list (local script এর জন্য) |
| POST | `/api/ingest/beecrowd` | Agent | Beecrowd data জমা দেওয়া |

> URL এ `<id>` মানে database এর সংখ্যার `id` (1, 2, 3…), student এর roll / `student_id` নয়।

---

## ৫. Authentication API

### POST `/api/auth/login`

```json
{ "email": "admin@example.com", "password": "admin123" }
```

সফল (200):

```json
{
  "message": "Login successful",
  "user": { "id": 1, "name": "Staff", "email": "admin@example.com",
            "created_at": "2026-11-16 09:00:00", "last_login_at": "2026-11-16 09:02:28" }
}
```

ভুল হলে `401` → `{ "error": "Wrong email or password" }`। ১৫ মিনিটে ১০ বার ভুল হলে `429`।

### POST `/api/auth/logout`

Body লাগে না। → `{ "message": "Logged out" }`

### GET `/api/auth/me`

```json
{
  "user": { "id": 2, "name": "Irshad", "email": "irshad@uftb.edu", "role": "developer", "student_pk": 15,
            "created_at": "...", "last_login_at": "..." },
  "student": { "...student object (৬ নম্বর অংশ), email সহ" }
}
```

- `role` দেখে UI ঠিক করুন: `admin` হলে "Accounts" menu আর সবার log দেখান, `developer` হলে না।
- `student_pk` = এই user এর নিজের leaderboard profile এর `id`। `student` null মানে তার কোনো leaderboard profile নেই (যেমন admin যে platform info দেয়নি)।
- Login না থাকলে `401`।

### PUT `/api/auth/me`

`{ "name": "Irshad" }` → `{ "user": {...} }` (login account এর নাম)

### PUT `/api/auth/me/profile`  (Login এর পর "My profile" → Edit)

নিজের leaderboard profile edit। Body তে student object এর যেকোনো field (৬ নম্বর অংশ এর নিয়ম):

```json
{ "avatar_url": "https://github.com/irshad.png", "github_url": "irshad", "codeforces_id": "irshad_cf", "beecrowd_id": "" }
```

| অবস্থা | কী হয় |
| --- | --- |
| Profile আছে | শুধু পাঠানো field বদলায় (PUT `/api/students/<id>` এর মতো নিয়ম) |
| Profile নেই | নতুন profile তৈরি হয়ে account এর সাথে link হয়। তখন `student_id`, `name`, `department`, `batch` আবশ্যক। Developer হলে `special_role` নিজে `developer` হয়ে যায় |

→ `{ "student": {...} }`। Platform username বদলালে ওই platform এর history মুছে যায় (UI তে warning দিন)।

**Admin এর platform info ঐচ্ছিক:** Admin এর profile না থাকলে সে leaderboard এ আসে না। চাইলে এই API দিয়ে profile বানাতে পারে, আর পরে চাইলে `DELETE` দিয়ে সরাতে পারে।

### DELETE `/api/auth/me/profile`

নিজের profile (আর history) leaderboard থেকে মুছে দেয়, login account থাকে। → `{ "message": "Profile removed from the leaderboard" }`

### POST `/api/auth/change-password`  (Profile → "Change password")

```json
{ "current_password": "admin123", "new_password": "newStrongPass" }
```

| ফলাফল | Status | Response |
| --- | --- | --- |
| সফল | 200 | `{ "message": "Password changed" }` |
| Current password ভুল | 400 | `{ "error": "Current password is wrong" }` |
| নতুন password ৬ অক্ষরের কম | 400 | `{ "error": "New password must be at least 6 characters" }` |
| নতুন আর পুরোনো এক | 400 | `{ "error": "New password must be different from the current one" }` |

Frontend এ form এ তিনটা field রাখুন: current, new, confirm new। Confirm মিলছে কিনা frontend নিজে check করবে।

### Login account (Admin)

| Method | URL | Body | নোট |
| --- | --- | --- | --- |
| GET | `/api/users` | – | যে কোনো staff। Log filter এর dropdown এ কাজে লাগে |
| POST | `/api/users` | `{ "name", "email", "password", "role": "developer", "student_pk": 15 }` | `201`। `role` = `admin` বা `developer` (default developer)। `student_pk` ঐচ্ছিক: কোন student এর profile এই account এর। Developer link হলে ওই student এর `special_role` নিজে `developer` হয় |
| PUT | `/api/users/<id>` | `{ "name"?, "role"?, "student_pk"? }` | `student_pk: null` = unlink। শেষ admin কে developer বানানো যায় না (`409`) |
| POST | `/api/users/<id>/reset-password` | `{ "new_password" }` | কেউ password ভুলে গেলে |
| DELETE | `/api/users/<id>` | – | শুধু login মোছে, leaderboard profile থাকে। নিজেকে মোছা যায় না |

- Email আগেই থাকলে `409`, একটা student আরেক account এ আগেই link থাকলে `409`, developer এই API ডাকলে `403`।

---

## ৬. Student API (Staff)

### Student object

```json
{
  "id": 1,
  "student_id": "2023001",
  "name": "Rahim Uddin",
  "department": "SWE",
  "batch": "10",
  "email": "rahim@example.com",
  "special_role": "developer",
  "avatar_url": "https://example.com/rahim.jpg",
  "github_url": "https://github.com/rahim",
  "linkedin_url": "https://www.linkedin.com/in/rahim",
  "codeforces_id": "rahim_cf",
  "leetcode_id": "rahim_lc",
  "codechef_id": "",
  "beecrowd_id": "1072467",
  "created_at": "2026-11-16 09:00:00",
  "updated_at": "2026-11-16 09:00:00"
}
```

| Field | আবশ্যক? | নিয়ম |
| --- | --- | --- |
| `student_id` | হ্যাঁ | Unique roll / ID |
| `name` | হ্যাঁ | |
| `department` | হ্যাঁ | যেমন `SWE` |
| `batch` | হ্যাঁ | যেমন `10` |
| `email` | না | দিলে valid email হতে হবে |
| `special_role` | না | ছোট হাতে সেভ হয়। যেমন `developer`, `mentor`। খালি = সাধারণ student |
| `avatar_url` | না | **পুরো `http(s)://` link**। Frontend সরাসরি `<img src>` এ বসাবে |
| `github_url` | না | পুরো link, বা শুধু username দিলে `https://github.com/<username>` বানিয়ে নেয় |
| `linkedin_url` | না | পুরো link, বা শুধু username দিলে `https://www.linkedin.com/in/<username>` |
| `codeforces_id`, `leetcode_id`, `codechef_id` | না | Username। ভুল করে profile link দিলেও শেষ অংশ থেকে username বের করে নেয় |
| `beecrowd_id` | না | **Beecrowd profile এর সংখ্যার ID** (`judge.beecrowd.com/en/profile/1072467` → `1072467`) |

**কেন শুধু `http(s)` link:** `javascript:` বা অন্য কোনো link কেউ ঢুকিয়ে দিলে frontend এ `<a href>` / `<img src>` এ বসালে security সমস্যা হতে পারে। তাই backend সেটা আগেই আটকায়।

**Avatar link সম্পর্কে:** Google Drive এর "share" link সরাসরি `<img>` এ দেখায় না। সরাসরি image link (যেমন `.jpg`/`.png`, GitHub avatar `https://github.com/<user>.png`, Imgur ইত্যাদি) দিন। Image না এলে frontend নামের প্রথম অক্ষর দিয়ে একটা circle দেখাবে।

### GET `/api/students`

সব student (নাম অনুযায়ী সাজানো)। Filter: `?search=rahim` (নাম বা student_id), `?batch=10`, `?department=SWE`। একসাথেও দেওয়া যায়।

### POST `/api/students`

Body তে উপরের field গুলো। সফল হলে `201` + student object।
- আবশ্যক field না থাকলে `400` → `{ "error": "'department' is required", "errors": [...] }`
- `student_id` আগেই থাকলে `409`

### GET `/api/students/<id>`

একজন student (email সহ)। না পেলে `404`।

### PUT `/api/students/<id>`

**শুধু যে field বদলাতে চান সেগুলোই পাঠান।** যেটা পাঠাবেন না সেটা আগের মতো থাকবে।

```json
{ "name": "Rahim Uddin", "leetcode_id": "new_lc_name", "special_role": "developer" }
```

| পাঠালেন | কী হবে |
| --- | --- |
| আবশ্যক field (`name`, `batch`…) খালি `""` | `400` — খালি করা যাবে না |
| ঐচ্ছিক field (`email`, `avatar_url`…) খালি `""` | মুছে যাবে |
| Platform ID খালি `""` | ওই platform account ও তার **পুরো history মুছে যাবে** |
| Platform ID নতুন username | পুরোনো account + history মুছে নতুন account। পরের sync থেকে নতুন হিসাব |
| Key না পাঠালে | কিছুই বদলায় না |

সফল হলে আপডেট হওয়া student object।

### DELETE `/api/students/<id>`

→ `{ "message": "Student deleted" }`। Account ও history সব মুছে যায়। মোছার আগের পুরো তথ্য log এ রাখা হয়।

---

## ৭. Excel দিয়ে একসাথে অনেক student যোগ / আপডেট

দুই ধাপ: **upload → preview দেখানো → confirm → import**।

### Excel এর column

- ফাইল `.xlsx` হতে হবে, প্রথম sheet পড়া হয়, প্রথম row = column এর নাম।
- Column এর নাম লেখার ধরন নিয়ে চিন্তা নেই: বড়/ছোট হাত, space, `-` সব ঠিক হয়ে যায়। কিছু চেনা নামও কাজ করে:

| আসল column | এই নামগুলোও চলবে |
| --- | --- |
| `student_id` | `Student ID`, `ID`, `Roll` |
| `name` | `Full Name`, `Student Name` |
| `department` | `Dept` |
| `batch` | |
| `email` | `Mail`, `Email Address` |
| `special_role` | `Role`, `Tag` |
| `avatar_url` | `Profile Picture`, `Photo`, `Picture URL`, `Image` |
| `github_url` | `GitHub`, `GitHub Profile` |
| `linkedin_url` | `LinkedIn`, `LinkedIn Profile` |
| `codeforces_id` | `Codeforces`, `CodeForce`, `CF` |
| `leetcode_id` | `LeetCode`, `LC` |
| `codechef_id` | `CodeChef`, `CC` |
| `beecrowd_id` | `Beecrowd`, `Beecrowed`, `URI` |

- আবশ্যক column: `student_id`, `name`, `department`, `batch`
- অচেনা column বাদ দেওয়া হয়, response এর `ignored_columns` এ নাম আসে।
- সঠিক format এর খালি ফাইল: `GET /api/students/excel/template` (login লাগে, ফাইল download হয়)।

### ধাপ ১: POST `/api/students/excel/upload`

`multipart/form-data`। Field:
- `file` — .xlsx ফাইল
- `mode` — ঐচ্ছিক:
  - `create` (default): যে `student_id` আগেই database এ আছে সেটা error row
  - `upsert`: আগে থাকা student **update** হবে। শুধু যে cell এ মান আছে সেটাই বদলাবে, খালি cell আগের মান রেখে দেয়

```javascript
const form = new FormData();
form.append("file", fileInput.files[0]);
form.append("mode", "upsert"); // ঐচ্ছিক

const res = await fetch(`${BASE}/api/students/excel/upload`, {
  method: "POST",
  credentials: "include",
  body: form, // Content-Type নিজে সেট করবেন না
});
```

Response:

```json
{
  "import_id": "a1b2c3d4...",
  "mode": "upsert",
  "total_rows": 3,
  "valid_count": 2,
  "error_count": 1,
  "create_count": 1,
  "update_count": 1,
  "ignored_columns": ["remarks"],
  "rows": [
    { "row": 2, "action": "create", "data": { "student_id": "2023001", "name": "Rahim", "...": "..." }, "errors": [] },
    { "row": 3, "action": "update", "data": { "student_id": "2023002", "...": "..." }, "errors": [] },
    { "row": 4, "action": "create", "data": { "student_id": "", "...": "..." }, "errors": ["'student_id' is required"] }
  ]
}
```

- `rows` দিয়ে preview table। `errors` খালি না হলে row লাল, `action: "update"` হলে হলুদ/নীল ট্যাগ দিন।
- `row` = Excel এর আসল row নম্বর (user Excel খুলে ঠিক করতে পারবে)।
- **এই ধাপে কোনো student সেভ হয় না।**
- সম্ভাব্য error: `Missing required column(s): ...`, `Please upload an .xlsx Excel file`, `The Excel file is empty`, `Could not read this file...`, `413` (৫ MB এর বেশি)।

### ধাপ ২: POST `/api/students/excel/import`

```json
{ "import_id": "a1b2c3d4..." }
```

→ `{ "message": "Import finished", "imported": 1, "updated": 1, "skipped": 0 }`

- শুধু valid row import হয়।
- `skipped` = upload আর confirm এর মাঝে অন্য কেউ একই student_id যোগ করে ফেলেছে।
- `import_id` **২ ঘণ্টা** valid, একবারই ব্যবহার করা যায়। না পেলে `404` → আবার upload।
- পুরো import একটা transaction এ হয় (৩০০ জন এক সেকেন্ডের মধ্যে)।

---

## ৮. Sync: data আনা

### কীভাবে history রাখা হয় (কেন এভাবে)

Codeforces / LeetCode / CodeChef / Beecrowd শুধু **মোট solved সংখ্যা** দেয়, কোন দিন কোন problem solve হলো তা দেয় না। তাই:

1. প্রতিবার sync এ প্রতিটা account এর মোট সংখ্যা **আজকের তারিখে** একটা snapshot হিসেবে সেভ হয় (`solve_snapshots`)। একই দিনে আবার sync হলে আজকের snapshot টাই update হয়।
2. কোনো সময়ের মধ্যে কতগুলো solve = **এখনকার মোট − ওই সময় শুরুর আগের দিনের শেষের মোট**।
3. Account এর অত পুরোনো snapshot না থাকলে **প্রথম sync এর মোট** ধরা হয়। তাই প্রথম sync এ আগের সব problem "নতুন" হিসেবে গোনা হয় না।

D = `as_of_day` (শেষ platform sync এর দিন, নিচে ব্যাখ্যা আছে)।

| Period | কোন সময় | হিসাব |
| --- | --- | --- |
| `this-day` | D দিন (`as_of_day`) | D এর শেষের মোট − D−১ এর শেষের মোট |
| `last-3-days` | D সহ শেষ ৩ দিন | D এর শেষের মোট − D−৩ এর শেষের মোট |
| `last-week` | D সহ শেষ ৭ দিন | D এর শেষের মোট − D−৭ এর শেষের মোট |
| `last-month` | D সহ শেষ ৩০ দিন | D এর শেষের মোট − D−৩০ এর শেষের মোট |
| `all-time` | সব | এখনকার মোট |

এভাবে ৩০০ student × ৪ platform = ১২০০ account এর জন্য দিনে ১২০০ row, বছরে ~৪.৪ লাখ row — SQLite এর জন্য খুবই ছোট। পুরো leaderboard হিসাব এক query তে হয়, আর ফলাফল cache থাকে যতক্ষণ না নতুন data আসে।

### Sync এর দুই mode (`.env` এর `SYNC_MODE`)

| Mode | কোথায় | `POST /api/sync` চাপলে |
| --- | --- | --- |
| `thread` (default) | Local computer | সাথে সাথে পেছনে sync শুরু হয় |
| `queue` | PythonAnywhere | Sync **queue** তে যায়; scheduled task (`python app.py sync`) পরের বার চালালে সেটা চলে |

PythonAnywhere এর web app এ background thread নির্ভরযোগ্যভাবে চলে না, আর দীর্ঘ কাজ web request এর ভেতর রাখা যায় না। তাই সেখানে sync চলে **Scheduled task** দিয়ে (১৮ নম্বর অংশ)।

### প্রতিদিন automatic sync (রাত ১১:৫৯)

| কোথায় | কে চালায় |
| --- | --- |
| Local (`python app.py`, `SYNC_MODE=thread`) | Server এর ভেতরের একটা ঘড়ি, প্রতিদিন `AUTO_SYNC_TIME` (default `23:59`, Dhaka) এ। Server চালু থাকতে হবে |
| PythonAnywhere (`SYNC_MODE=queue`) | Scheduled task, **17:59 UTC** (= রাত ১১:৫৯ Dhaka) এ `python3 app.py sync` |

- একই দিনে automatic sync দুইবার চলে না।
- Sync এর সব snapshot **sync শুরুর তারিখে** সেভ হয়। ১১:৫৯ এ শুরু হয়ে রাত ১২:১০ এ শেষ হলেও সব data আগের দিনের হিসাবে থাকে।
- Beecrowd এর data আলাদা: local script যখন চালাবেন তখন আসে (১০ নম্বর অংশ)। যেদিন push হয় সেই দিনের snapshot হিসেবে সেভ হয়।
- Staff চাইলে দিনের মাঝেও `POST /api/sync` দিয়ে হাতে sync করতে পারে।

### "This Day" কোন দিন বোঝায় (`as_of_day`)

Sync রাত ১১:৫৯ এ হয়। রাত ১২টার পর নতুন দিনের কোনো data থাকে না, তাই "This Day" কে ক্যালেন্ডারের আজ ধরলে সারাদিন সবার ০ দেখাত। তাই period গুলো গোনা হয় **শেষ platform sync এর দিন** থেকে। এই দিনটাকে বলা হয় `as_of_day`, যা leaderboard response এ আসে।

- উদাহরণ: ১৬ নভেম্বর রাত ১১:৫৯ এ sync → ১৭ তারিখ সারাদিন "This Day" = ১৬ তারিখের solve, `as_of_day: "2026-11-16"`।
- ১৭ তারিখ দুপুরে কেউ হাতে sync করলে `as_of_day` হয়ে যায় ১৭, আর "This Day" দেখায় ১৭ তারিখের এখন পর্যন্ত solve।
- Frontend এ tab এর পাশে তারিখ দেখান: "This Day · 16 Nov"।
- `all-time` সবসময় সবচেয়ে নতুন সংখ্যা (beecrowd এর আজকের push সহ)।

### POST `/api/sync`

Body লাগে না। → `202`

```json
{ "message": "Sync started. Check progress at GET /api/sync/status", "run_id": 12, "mode": "thread" }
```

Queue mode এ `message` হবে `"Sync queued. It will run with the next scheduled task."`। আগের sync চলছে বা queue তে থাকলে `409`।

### GET `/api/sync/status`

```json
{
  "id": 12,
  "status": "running",
  "running": true,
  "queued": false,
  "trigger": "manual",
  "total": 900,
  "done": 340,
  "failed": ["2023005 / leetcode (rahim_lc): Not Found"],
  "created_at": "2026-11-16 10:00:00",
  "started_at": "2026-11-16 10:00:00",
  "finished_at": null,
  "mode": "thread",
  "platforms_synced_at": "2026-11-15 03:10:22",
  "beecrowd_synced_at": "2026-11-15 22:05:10"
}
```

| Field | মানে |
| --- | --- |
| `status` | `never` / `queued` / `running` / `finished` / `failed` |
| `trigger` | `manual` (বাটন) বা `schedule` (প্রতিদিনের task) |
| `total` / `done` | Progress bar = `done / total` |
| `failed` | কোন student, কোন platform, কোন username, কেন fail |
| `platforms_synced_at` | শেষ সফল CF/LC/CC sync কখন শেষ হয়েছে |
| `beecrowd_synced_at` | শেষ beecrowd data কখন এসেছে |

২০ মিনিট কোনো সাড়া না দিলে sync কে `failed` ধরা হয় (server বন্ধ হয়ে গেলে যেন চিরকাল "running" না থাকে)।

**Frontend এ:**
1. "Sync" বাটন → `POST /api/sync`, বাটন disable।
2. প্রতি ২ সেকেন্ডে `GET /api/sync/status`।
3. `running` false হলে polling বন্ধ, `failed` থাকলে দেখান, leaderboard আবার load করুন।
4. `queued` true হলে লিখুন "পরের scheduled sync এ চলবে", polling করার দরকার নেই।

### GET `/api/sync/runs?limit=20`

আগের sync গুলোর array (উপরের মতো object)। Admin panel এ history দেখানোর জন্য।

---

## ৯. Activity Log (Staff)

**Admin সবার log দেখে, developer শুধু নিজের।** (Developer এর request এ `user_id` filter নিজে থেকেই তার নিজের id হয়ে যায়।)

প্রতিটা কাজ আলাদা করে log হয়: কে (`actor`), কখন, কী (`action`), কার উপর (`target_type` + `target_id`), সংক্ষেপে (`summary`), বিস্তারিত (`details`, যেমন কোন field কী থেকে কী হলো), কোন IP থেকে।

### GET `/api/logs`

| Query | উদাহরণ | মানে |
| --- | --- | --- |
| `user_id` | `2` | একজন staff এর সব কাজ |
| `action` | `student` বা `student.update` | `student` দিলে `student.*` সব |
| `target_type` | `student` | |
| `target_id` | `15` | একজন student এর উপর যত কাজ হয়েছে |
| `from` / `to` | `2026-11-01` / `2026-11-16` | তারিখের সীমা |
| `limit` / `offset` | `50` / `0` | Pagination (limit সর্বোচ্চ ২০০) |

```json
{
  "total": 134,
  "limit": 50,
  "offset": 0,
  "items": [
    {
      "id": 134,
      "created_at": "2026-11-16 10:05:11",
      "user_id": 1,
      "actor": "admin@example.com",
      "action": "student.update",
      "target_type": "student",
      "target_id": "1",
      "summary": "Edited Rahim (2023001): name, leetcode_id",
      "details": { "changes": [ { "field": "name", "old": "Rahim", "new": "Rahim Uddin" } ] },
      "ip": "103.x.x.x"
    }
  ]
}
```

### Action এর তালিকা

| action | কখন |
| --- | --- |
| `auth.login` / `auth.login_failed` / `auth.logout` | Login / ভুল password / logout |
| `auth.password_change` / `auth.password_change_failed` / `auth.password_reset` | Password বদল / ভুল current password / console থেকে reset |
| `auth.profile_update` | নিজের নাম বদল |
| `user.create` | নতুন staff |
| `student.create` / `student.update` / `student.delete` | Student যোগ / edit / delete |
| `excel.upload` / `excel.import` | Excel preview / confirm |
| `sync.start` / `sync.finished` | Sync শুরু (staff) / শেষ (`system`) |
| `beecrowd.ingest` | Beecrowd data এসেছে (`beecrowd-agent`) |
| `profile.create` / `profile.update` / `profile.delete` | কেউ নিজের leaderboard profile বানিয়েছে / বদলেছে / সরিয়েছে |
| `user.update` / `user.delete` | Admin কারো role / link বদলেছে, account মুছেছে |

---

## ১০. Beecrowd: local machine থেকে data পাঠানো

### কেন এভাবে

Beecrowd এর সামনে Cloudflare আছে। Server (PythonAnywhere) থেকে scrape করলে আটকে যায়। তাই:

```
[আপনার computer]                                   [Backend]
beecrowd_push.py
  1. GET  /api/ingest/beecrowd/usernames  ───────►  database এর beecrowd ID list
  2. beecrowd.py দিয়ে Brave এ scrape (Cloudflare এ দরকার হলে একবার click)
  3. beecrowd_stats.json এ backup
  4. POST /api/ingest/beecrowd  ─────────────────►  snapshot সেভ, leaderboard update
```

### Security: কেন HMAC signature

একটা সাধারণ password header পাঠালে কেউ সেটা দেখে ফেললে চিরকাল ব্যবহার করতে পারত। HMAC এ:
- Secret (`INGEST_SECRET`) কখনো network এ যায় না। শুধু তা দিয়ে বানানো signature যায়।
- Signature body এর উপর বানানো, তাই data পথে কেউ বদলালে মিলবে না।
- Timestamp ৫ মিনিটের বেশি পুরোনো হলে reject, তাই পুরোনো request ধরে আবার পাঠানো যায় না।

Header:
```
X-Timestamp: 1794800000
X-Signature: hex( HMAC_SHA256(INGEST_SECRET, "1794800000." + raw_body) )
```

Frontend এর এই দুই API নিয়ে কিছু করার নেই; এগুলো শুধু script ব্যবহার করে।

### POST `/api/ingest/beecrowd`

Body = `beecrowd.py` যেটা JSON এ সেভ করে ঠিক সেটাই:

```json
{
  "source": "beecrowd",
  "updated_at": "2026-11-16T04:00:00+00:00",
  "users": { "1072467": { "rank": "12,345", "points": "1234.56", "submissions": 300, "solved": 150 } }
}
```

→ `{ "message": "Beecrowd data saved", "updated": 12, "failed": ["1072470: Not Found"], "unknown": ["999"] }`

- `points` → beecrowd এর `rating` হিসেবে সেভ হয়, `rank` → `rank`।
- `unknown` = এমন ID যেটা কোনো student এর না।

### চালানো (local)

1. Backend এর `.env` আর computer এর `.env` (beecrowd ফোল্ডারে) দুই জায়গায় **একই** `INGEST_SECRET` দিন।
2. Computer এর `.env` এ `BACKEND_URL=http://localhost:5000` (deploy এর পর `https://<username>.pythonanywhere.com`)।
3. `python beecrowd_push.py`
4. Backend এ না পৌঁছালে data `beecrowd_stats.json` এ থাকে → পরে `python beecrowd_push.py --push-only beecrowd_stats.json`

প্রতিদিন automatic চালাতে Linux এ cron / Windows এ Task Scheduler — তবে **logged-in desktop session** এ চালাতে হবে, কারণ Brave window খোলে (Cloudflare এর জন্য)।

---

## ১১. Leaderboard (Public)

### GET `/api/leaderboard`

| Query | মান | Default | কাজ |
| --- | --- | --- | --- |
| `period` | `this-day` / `last-3-days` / `last-week` / `last-month` / `all-time` | `all-time` | কোন সময়ের হিসাবে rank |
| `sort` | `solved` / `rating` / `codeforces` / `leetcode` / `codechef` / `beecrowd` | `solved` | কী দিয়ে সাজানো |
| `platform` | `all` / `codeforces` / `leetcode` / `codechef` / `beecrowd` | `all` | শুধু `sort=rating` হলে (UI এর "Rank" toggle) |
| `batch` | `10` | সব | শুধু এই batch (rank ও এর ভেতরেই) |
| `department` | `SWE` | সব | শুধু এই department |
| `search` | `rah` | – | নাম / student_id দিয়ে খোঁজা। **rank বদলায় না**, শুধু row লুকায় |
| `limit` / `offset` | `50` / `0` | সব | Pagination (৩০০ জন একবারে আনলেও সমস্যা নেই) |

`sort` এর মানে:
- `solved` → নির্বাচিত period এ মোট solve (সমান হলে all-time মোট দিয়ে tie ভাঙে, তারপর নাম)
- `codeforces` ইত্যাদি → ওই platform এ ওই period এর solve (table এর column header এ click)
- `rating` (UI তে **"Rank"** toggle):
  - `platform=all` (default) → **সব platform মিলিয়ে মোট solved (all-time)** দিয়ে rank
  - `platform=codeforces` ইত্যাদি → ওই platform এর rating (beecrowd এ points)। Rating নেই এমন student নিচে

### Response

```json
{
  "period": "last-week",
  "sort": "solved",
  "rating_platform": null,
  "out_of": 300,
  "matched": 300,
  "as_of_day": "2026-11-16",
  "generated_at": "2026-11-16 10:00:00",
  "platform_leaders": {
    "codeforces": { "value": 16, "ids": [5] },
    "leetcode":   { "value": 16, "ids": [7] },
    "codechef":   { "value": 12, "ids": [1, 4] },
    "beecrowd":   { "value": 0,  "ids": [] }
  },
  "last_sync": { "platforms_synced_at": "2026-11-16 03:10:00", "beecrowd_synced_at": "2026-11-15 22:05:00" },
  "rows": [
    {
      "id": 1,
      "student_id": "2023001",
      "name": "Rahim Uddin",
      "department": "SWE",
      "batch": "10",
      "avatar_url": "https://example.com/rahim.jpg",
      "github_url": "https://github.com/rahim",
      "linkedin_url": "",
      "special_role": "developer",
      "solved": { "this-day": 2, "last-3-days": 5, "last-week": 9, "last-month": 30, "all-time": 150 },
      "growth": {
        "this-day":    { "previous": 1, "change": 1,  "percent": 100.0 },
        "last-3-days": { "previous": 4, "change": 1,  "percent": 25.0 },
        "last-week":   { "previous": 12, "change": -3, "percent": -25.0 },
        "last-month":  { "previous": 0, "change": 30, "percent": null }
      },
      "platforms": {
        "codeforces": {
          "username": "rahim_cf",
          "url": "https://codeforces.com/profile/rahim_cf",
          "solved": { "this-day": 2, "last-3-days": 3, "last-week": 6, "last-month": 20, "all-time": 100 },
          "rating": 1450.0,
          "rank": "specialist",
          "last_synced": "2026-11-16 03:10:00",
          "error": null
        },
        "leetcode": { "...": "..." },
        "codechef": { "username": null, "url": null, "solved": { "this-day": 0, "...": 0 }, "rating": null, "rank": null, "last_synced": null, "error": null },
        "beecrowd": { "...": "..." }
      },
      "rank": 1,
      "medal": "gold",
      "period_solved": 9,
      "sort_value": 9,
      "top_in": ["codeforces"]
    }
  ]
}
```

### Field গুলোর মানে ও কেন দরকার

| Field | মানে | Frontend এ কী করবেন |
| --- | --- | --- |
| `rank` | অবস্থান (১ থেকে) | Standing column |
| `medal` | `gold` / `silver` / `bronze` / `null` | ১, ২, ৩ এ avatar এর চারপাশে badge। Sort value ০ হলে medal `null` (সবাই ০ হলে কাউকে gold দেওয়া ভুল দেখায়) |
| `special_role` | `"developer"` বা `""` | খালি না হলে নামের পাশে ছোট icon (developer → `</>` icon)। অচেনা role হলে সাধারণ tag |
| `solved` | **সব period একসাথে** | Period tab বদলালে আবার request না করেও সংখ্যা দেখানো যায়। "Last Week" column = `solved["last-week"]` |
| `period_solved` | নির্বাচিত period এর solve | মূল সংখ্যা |
| `sort_value` | যেটা দিয়ে rank হয়েছে | Rating sort এ rating দেখানো |
| `growth[period]` | আগের সমান দৈর্ঘ্যের সময়ের সাথে তুলনা | Growth column: `change` > 0 সবুজ ▲, < 0 লাল ▼। `percent` null হলে "new" লিখুন। `all-time` এর growth নেই |
| `platforms[p].solved` | ওই platform এ প্রতিটা period | Platform column এ নির্বাচিত period এর সংখ্যা |
| `platforms[p].username` `null` | Account নেই | "—" দেখান |
| `platforms[p].error` | শেষ sync এ সমস্যা (যেমন `Not Found`) | ছোট ⚠ icon + tooltip |
| `platforms[p].url` | Profile link | Click এ নতুন tab |
| `top_in` | যে platform গুলোতে এই period এ এই student সবার উপরে | ওই cell highlight |
| `platform_leaders` | প্রতিটা platform এ সর্বোচ্চ মান আর কারা | Header এ "Top: 16" দেখানো যায় |
| `out_of` | মোট কতজন rank হয়েছে | "4 / 300" |
| `last_sync` | কখন data update হয়েছে | Footer এ "Updated 3 hours ago" |
| `as_of_day` | "This Day" কোন তারিখের (৮ নম্বর অংশ) | Tab এ "This Day · 16 Nov" |

**Growth এর উদাহরণ:** `last-week` = শেষ ৭ দিন, `previous` = তার আগের ৭ দিন। `this-day` এর `previous` = গতকাল।

---

## ১২. Student Profile (Public)

### GET `/api/students/<id>/profile?period=all-time&sort=solved`

Leaderboard এর মতো একই `period`, `sort`, `platform`, `batch`, `department` query নেয়। Leaderboard থেকে যে filter নিয়ে profile এ ঢোকা হয়েছে সেটাই পাঠান, তাহলে profile এর rank leaderboard এর সাথে মিলবে।

```json
{
  "student": { "...leaderboard row এর সব field (rank, medal, solved, growth, platforms, top_in...)" },
  "standing": { "rank": 4, "out_of": 300, "medal": null, "period": "all-time", "sort": "solved" },
  "is_leader": false,
  "leader": { "...#1 student এর পুরো leaderboard row" },
  "last_sync": { "platforms_synced_at": "...", "beecrowd_synced_at": "..." }
}
```

| Field | কাজ |
| --- | --- |
| `student.avatar_url` + `standing.medal` | Profile ছবির উপর gold/silver/bronze badge |
| `student.special_role` | Developer হলে ছবির কোণে ছোট icon |
| `standing.rank` / `out_of` | নামের ডানে `#4 / 300` |
| `student.github_url`, `linkedin_url`, `platforms[p].url` | নিচে social / platform link এর সারি |
| `student.platforms` + `student.solved` | Details table (platform × period) |
| `leader` | #1 এর তথ্য, comparison এর জন্য |
| `is_leader` | এই student নিজেই #1 হলে `true`, তখন comparison দেখানোর দরকার নেই |

**কেন `leader` একসাথে পাঠানো হয়:** Profile এ "আমি vs #1" তুলনা দেখানো হবে। আলাদা request না করে একবারেই পাঠালে page দ্রুত load হয় আর দুটো সংখ্যা একই সময়ের data থেকে আসে।

---

## ১৩. Performance Graph (Public)

### GET `/api/students/<id>/history?days=30&compare=leader&period=all-time&sort=solved`

| Query | Default | মানে |
| --- | --- | --- |
| `days` | `30` | কত দিনের graph (২ থেকে ৩৬৫)। ৭ / ৩০ / ৯০ বাটন রাখুন |
| `compare` | `leader` | `leader` হলে #1 student এর series ও আসে। `none` হলে আসে না |
| `period`, `sort`, … | `all-time`, `solved` | #1 কে ঠিক করতে (leaderboard এর মতো) |

```json
{
  "days": 30,
  "dates": ["2026-10-18", "2026-10-19", "...", "2026-11-16"],
  "student": {
    "id": 5, "student_id": "2023005", "name": "Karim", "avatar_url": "...",
    "series": {
      "all":        { "total": [274, 280, null, "..."], "daily": [0, 6, 0, "..."] },
      "codeforces": { "total": [100, 104, "..."], "daily": [0, 4, "..."], "rating": [1400, 1412, "..."] },
      "leetcode":   { "total": [], "daily": [], "rating": [] },
      "codechef":   { "...": "..." },
      "beecrowd":   { "...": "..." }
    }
  },
  "leader": { "id": 1, "student_id": "2023001", "name": "Rahim", "avatar_url": "...", "series": { "...একই আকার" } },
  "leader_is_self": false
}
```

| Series | মানে | Chart |
| --- | --- | --- |
| `total[i]` | `dates[i]` দিনের শেষে মোট solved। `null` = তখনো track শুরু হয়নি | Line chart (cumulative) |
| `daily[i]` | ওই দিনে কতগুলো solve | Bar chart |
| `rating[i]` | ওই দিনের শেষে rating (beecrowd এ points) | Rating line |
| `all` | সব platform যোগ করে | "All" tab |

সব array এর দৈর্ঘ্য `dates` এর সমান, তাই index মিলিয়ে বসালেই হয়।

**Platform বাছাই:** Chart এর উপরে chip/tab: `All | Codeforces | LeetCode | CodeChef | Beecrowd`। `All` হলে `series.all`, নাহলে `series[platform]`। চাইলে "Stacked" mode এ চারটা platform একসাথে আলাদা রঙে।

**Highlight / dim (কেন):** একই chart এ দুটো line থাকে: এই student এর line **উজ্জ্বল, মোটা** (মূল বিষয়), আর #1 এর line **হালকা/ধূসর, পাতলা, dashed** (শুধু তুলনার reference)। এতে student নিজের অগ্রগতি স্পষ্ট দেখে আর বুঝতে পারে #1 থেকে কতটা পিছিয়ে। `leader_is_self` true হলে দ্বিতীয় line দেখাবেন না, বরং "You are #1" badge দেখান।

**একটা দিন sync না হলে:** ওই দিন `daily` ০ থাকে, আর পরের sync এর দিনে দুই দিনের solve একসাথে দেখায়। তাই প্রতিদিন sync হওয়া জরুরি।

---

## ১৪. Dashboard ও Meta (Public)

### GET `/api/dashboard/summary`

```json
{
  "total_students": 300,
  "accounts": { "codeforces": 280, "leetcode": 250, "codechef": 120, "beecrowd": 200 },
  "total_solved": 45210,
  "today_solved": 120,
  "solved": { "this-day": 120, "last-3-days": 410, "last-week": 980, "last-month": 3800, "all-time": 45210 },
  "by_platform": { "codeforces": 20000, "leetcode": 15000, "codechef": 3000, "beecrowd": 7210 },
  "batches": ["10", "11", "12"],
  "departments": ["SWE"],
  "leaderboard": [ "...all-time এর top 10 (leaderboard row)" ],
  "last_sync": { "...": "..." }
}
```

`batches` / `departments` দিয়ে leaderboard এর filter dropdown বানান।

### GET `/api/meta`

```json
{ "platforms": [...], "periods": [...], "sorts": [...], "profile_links": {...}, "public_read": true }
```

---

## ১৫. Frontend এ ব্যবহারের নমুনা

```javascript
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const res = await fetch(BASE + path, {
    credentials: "include",                                       // cookie এর জন্য, ভুলবেন না
    headers: isForm ? {} : { "Content-Type": "application/json" }, // FormData তে header দেবেন না
    ...options,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.blob();
  if (!res.ok) {
    const err = new Error(data?.error || "কিছু একটা ভুল হয়েছে");
    err.status = res.status;
    err.errors = data?.errors;
    throw err;
  }
  return data;
}

// App শুরুতে
const me = await api("/api/auth/me").catch(() => null);

// Leaderboard
const lb = await api("/api/leaderboard?period=last-week&sort=solved");

// Profile + graph একসাথে
const [profile, history] = await Promise.all([
  api(`/api/students/${id}/profile?period=all-time&sort=solved`),
  api(`/api/students/${id}/history?days=30`),
]);

// Password change
await api("/api/auth/change-password", {
  method: "POST",
  body: JSON.stringify({ current_password, new_password }),
});
```

---

## ১৬. মনে রাখার বিষয়

1. **প্রথম দিন সব period এ ০ দেখাবে** (all-time ছাড়া)। History শুরু হয় প্রথম sync থেকে। দ্বিতীয় দিনের sync এর পর থেকে this-day / week ইত্যাদি সংখ্যা আসা শুরু হবে।
2. **"This Day" = `as_of_day`**, মানে শেষ sync এর দিন, ক্যালেন্ডারের আজ নাও হতে পারে।
3. **কিছু বদলাতে login লাগে** (admin / developer)। Public visitor দের জন্য edit বাটন লুকিয়ে রাখুন, আর `role` দেখে admin-only menu দেখান।
4. **ID দুই রকম:** `id` (database, URL এ) আর `student_id` (roll)।
5. **Platform username বদলালে** ওই platform এর পুরোনো history মুছে যায়।
6. **Beecrowd** data আসে শুধু local script চালালে। `beecrowd_synced_at` দেখে বোঝা যায় শেষ কবে এসেছে।
7. **একসাথে একটাই sync।** চলার সময় বাটন disable রাখুন।
8. **Public API তে email থাকে না।** Email লাগলে staff API।
9. **Cookie সমস্যা** হলে দেখুন: `credentials: "include"` আছে কিনা, frontend এর origin `FRONTEND_ORIGINS` এ আছে কিনা, আর frontend/backend আলাদা domain এ হলে `COOKIE_SAMESITE=None` ও `COOKIE_SECURE=1` (১৮ নম্বর অংশ)।
10. **Avatar** সরাসরি image link হতে হবে; image load fail হলে initials দেখান।

---

## ১৭. Backend চালানো (Local)

```bash
pip install -r requirements.txt
cp .env.example .env          # তারপর SECRET_KEY আর INGEST_SECRET বসান
python app.py                 # http://localhost:5000, প্রতিদিন ২৩:৫৯ এ নিজে sync করবে
```

একই ফোল্ডারে থাকতে হবে: `app.py`, `codeforces.py`, `leetcode.py`, `codechef.py`, `.env`। (`beecrowd.py` আর `beecrowd_push.py` শুধু local computer এ লাগে।)

| Command | কাজ |
| --- | --- |
| `python app.py` | Server চালু |
| `python app.py sync` | এখনই sync (scheduled task / হাতে) |
| `python app.py create-user EMAIL "Name" developer` | নতুন developer (password জিজ্ঞেস করবে)। শেষে `admin` দিলে admin |
| `python app.py set-password EMAIL` | কারো password ভুলে গেলে reset |

Secret বানাতে: `python -c "import secrets; print(secrets.token_hex(32))"`

পুরোনো `tracker.db` রেখে দিলেও চলবে (নতুন column নিজে যোগ হয়), তবে পুরোনো `solved_problems` table আর ব্যবহার হয় না। History নতুন করে শুরু হবে প্রথম sync থেকে। একদম নতুন শুরু করতে চাইলে `tracker.db` মুছে দিন।

---

## ১৮. PythonAnywhere এ deploy

1. **Files** এ project ফোল্ডার upload (যেমন `/home/<user>/cptracker/`)। `beecrowd.py` লাগবে না।
2. **Bash console:** `cd ~/cptracker && pip install --user -r requirements.txt`
3. **`.env`** (PythonAnywhere এর ফোল্ডারে):
   ```
   SECRET_KEY=<লম্বা random>
   INGEST_SECRET=<লম্বা random, local computer এও একই>
   SYNC_MODE=queue
   FRONTEND_ORIGINS=https://your-frontend.vercel.app
   COOKIE_SAMESITE=None
   COOKIE_SECURE=1
   FLASK_DEBUG=0
   ```
   Frontend যদি একই domain থেকে serve হয় তাহলে `COOKIE_SAMESITE=Lax` রাখলেই হবে।
4. **Web tab → Add a new web app → Manual configuration (Flask)।** WSGI file এ:
   ```python
   import sys
   path = "/home/<user>/cptracker"
   if path not in sys.path:
       sys.path.insert(0, path)
   from app import app as application
   ```
5. **Force HTTPS** চালু করুন, তারপর **Reload**।
6. **Tasks tab → Scheduled task** — প্রতিদিন **17:59 UTC** (= রাত ১১:৫৯ Dhaka):
   ```
   cd /home/<user>/cptracker && python3 app.py sync
   ```
   এটাই daily sync। Staff "Sync" বাটন চাপলে sync queue তে থাকে আর এই task এর পরের run এ চলে। এখনই চালাতে চাইলে Bash console থেকে একই command।
7. প্রথম login এর পর password বদলান।

**খেয়াল করুন:**
- PythonAnywhere এর **free account** এ বাইরের website এ শুধু একটা whitelist এর site এ যাওয়া যায়। Codeforces / LeetCode / CodeChef সেই list এ আছে কিনা আগে Bash console থেকে `python3 app.py sync` চালিয়ে দেখুন; fail হলে paid account বা PythonAnywhere কে whitelist এ যোগ করতে অনুরোধ লাগবে।
- Free account এ scheduled task দিনে একবার চলে, তাই queue করা manual sync পরের দিনের run এ হবে।
- SQLite এর `SQLITE_WAL` PythonAnywhere এ **বন্ধ** রাখুন (network disk)। Local এ চাইলে `SQLITE_WAL=1`।

### `.env` এর সব setting

| Variable | Default | মানে |
| --- | --- | --- |
| `SECRET_KEY` | (dev key) | Cookie sign করার key। **অবশ্যই বদলাবেন** |
| `INGEST_SECRET` | খালি (ingest বন্ধ) | Beecrowd script এর সাথে shared secret |
| `FRONTEND_ORIGINS` | `http://localhost:3000,http://localhost:5173` | কমা দিয়ে frontend এর origin |
| `PUBLIC_READ` | `1` | `0` করলে leaderboard দেখতেও login লাগবে |
| `SYNC_MODE` | `thread` | `thread` (local) / `queue` (PythonAnywhere) |
| `AUTO_SYNC` | `1` | Local server এ প্রতিদিন automatic sync (`thread` mode এ) |
| `AUTO_SYNC_TIME` | `23:59` | কখন (Dhaka সময়, `HH:MM`) |
| `COOKIE_SAMESITE` | `Lax` | ভিন্ন domain এ frontend হলে `None` |
| `COOKIE_SECURE` | `0` | HTTPS এ `1` (`SAMESITE=None` হলে আবশ্যক) |
| `SESSION_DAYS` | `7` | Login কত দিন থাকবে |
| `FIRST_USER_EMAIL` / `FIRST_USER_PASSWORD` | `admin@example.com` / `admin123` | একদম প্রথম **admin** account |
| `DB_PATH` | `tracker.db` (app এর ফোল্ডারে) | Database ফাইল |
| `SQLITE_WAL` | `0` | Local এ দ্রুত করার জন্য `1` |
| `FLASK_DEBUG` | `1` | Production এ `0` |
| `PORT` | `5000` | Local port |