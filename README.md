# 🌍 Carbon Ledger

A full-stack web application to track, monitor, and reduce your personal carbon footprint through emission tracking, visual insights, and personalized reduction goals.

## About

Carbon Ledger helps users understand and reduce their environmental impact by tracking emissions from daily activities — transport, energy, diet, shopping, and water. Users can visualize trends over time, set reduction goals, compare their footprint against global averages, and monitor whether their goals are moving in the right direction.

The interface is designed as an editorial-style data dashboard, with a responsive light/dark theme and a focus on clear, high-contrast data visualization.

## ✨ Features

- 👤 **User Authentication** — Secure register/login with JWT cookies and bcrypt password hashing
- 🧮 **Carbon Calculator** — Multi-step calculator covering transport, energy, diet, shopping, and water
- 📄 **Bill Upload** — Upload an electricity or water bill (PDF) and have usage auto-filled — handles standard "kWh/litres" bills, meter-reading-only bills (present − previous), and rate-derived fallback (charge ÷ rate) for bills with no explicit usage line. Recognizes kWh, litres, m³, kL, and gallons.
- 🔌 **EV & Renewable Electricity** — Separate emission factors for electric vs petrol cars and motorbikes/scooters, plus a renewable-electricity input (none / some / all) that discounts grid emissions accordingly
- 🌐 **52-Country Grid Data** — Region selector covers 52 countries individually (not just continents) so a hydro-heavy grid like Nepal's isn't lumped in with a coal-heavy neighbor
- 📊 **Dashboard** — Visual breakdown of emissions, category contributions, climate-budget context, and emission trends
- 🎯 **Goals** — Set and track personal carbon-reduction goals with progress and regression handling when emissions move in the wrong direction
- 🌓 **Light / Dark Theme** — Switch between light and dark themes with the selected preference persisted across sessions
- 🎨 **Editorial UI** — Responsive grid-based layout, custom category icons, high-contrast cards, themed charts, and visual hierarchy designed for data-heavy screens
- 📈 **Emission History** — Review previous submissions and visualize changes over time
- 💡 **Personalized Tips** — Receive reduction suggestions based on emission categories
- 🗂️ **Profile** — Manage location, household, and lifestyle preferences
- 🔐 **Admin Panel** — Admin-only route to view all users (role-based access control)
- 🌱 **Seed Data** — Pre-built seed script with realistic user profiles for testing

## 🎨 Design

Carbon Ledger uses a distinctive editorial/data-dashboard aesthetic rather than a conventional SaaS dashboard.

### Light Theme
- Warm off-white background
- Black typography
- Vermilion/coral accent
- Subtle grid background
- Off-white content cards
- Category-specific accent colors

### Dark Theme
- Near-black background
- Charcoal content surfaces
- High-contrast ivory typography
- Coral accent
- Muted but visible grid and borders
- Theme-aware charts, progress bars, forms, and data labels

Both themes are designed to preserve readability across dashboard cards, charts, goals, history, calculator, profile, and authentication screens.

## 📸 Screenshots

Replace these images with your latest screenshots when you're ready to push the updated project to GitHub.

| Dashboard | Goals |
|---|---|
| ![Dashboard overview](docs/screenshots/dashboard-overview.png) | ![Goals tab](docs/screenshots/dashboard-goals.png) |

| Calculator | History |
|---|---|
| ![Calculator](docs/screenshots/calculator-begining.png) | ![History trend](docs/screenshots/dashboard-history.png) |

## 🛠️ Tech Stack

- **Frontend** — Next.js (TypeScript)
- **Backend** — Node.js, Express.js
- **Database** — MongoDB, Mongoose
- **Auth** — JWT, bcrypt, httpOnly cookies
- **Styling** — CSS with theme variables and responsive layouts

## 📁 Project Structure

```text
carbon/
├── client/                  # Next.js frontend
│   └── app/
│       ├── calculator/      # Carbon footprint calculator
│       ├── components/      # Shared UI components and icons
│       ├── dashboard/       # Main dashboard
│       │   ├── goals/       # Goals tracking
│       │   └── profile/     # User profile
│       ├── login/
│       └── register/
└── server/                  # Express backend
    ├── constants/           # Emission factors
    ├── controller/          # Auth controller
    ├── db/                  # MongoDB connection
    ├── middleware/          # JWT auth + admin guard
    ├── models/              # Mongoose models
    ├── routes/              # API routes
    ├── Seed.js              # Database seeder
    └── admin.js             # Admin role utility
```

## 🚀 Getting Started

### Prerequisites

- Node.js
- npm
- MongoDB (running locally on port 27017)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Satish0802/carbon-ledger.git
   cd carbon-ledger
   ```

2. Install server dependencies:

   ```bash
   cd server
   npm install
   ```

   This installs `pdf-parse`, used to extract usage figures from uploaded bill PDFs.

3. Install client dependencies:

   ```bash
   cd ../client
   npm install
   ```

4. Set up environment variables — create `server/.env`:

   ```env
   MONGODB_URI=mongodb://localhost:27017/carbon_ledger
   JWT_SECRET=your_jwt_secret
   CLIENT_URL=http://localhost:3000
   PORT=8000
   ```

### Running the App

**Start MongoDB** (if not running as a service):

```bash
mongod
```

**Start the server:**

```bash
cd server
npm run dev
```

**Start the client:**

```bash
cd client
npm run dev
```

Open `http://localhost:3000` in your browser.

## 🌱 Seed Data

To populate the database with test users and emission entries:

```bash
cd server
node Seed.js
```

This creates 3 users with 6 months of realistic emission data each:

| Email | Password | Profile |
|---|---|---|
| priya@carbonledger.dev | password123 | Vegetarian, improving (India) |
| marcus@carbonledger.dev | password123 | High emitter, slowly reducing (US) |
| sofia@carbonledger.dev | password123 | Vegan, already low (Netherlands) |

> These are development/test credentials only. Do not use them in production.

## 🔐 Admin Access

To grant admin privileges to an account:

1. Register a user normally on the app.
2. Edit `server/admin.js` and set the email to your account's email.
3. Run:

   ```bash
   cd server
   node admin.js
   ```

4. Sign out and log back in — the new JWT will include the admin role.

Admin accounts can access `GET /users/all` to view all registered users.

## 🔌 API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/users/register` | Public | Register a new user |
| POST | `/users/login` | Public | Login |
| POST | `/users/logout` | User | Logout |
| PUT | `/users/:id` | User | Update own account |
| DELETE | `/users/:id` | User | Delete own account |
| GET | `/users/all` | Admin | Get all users |
| GET | `/users/profile` | User | Get own user record |
| POST | `/emissions` | User | Submit new calculator entry |
| POST | `/emissions/parse-bill` | User | Upload a bill PDF (`multipart/form-data`, field `bill`) — returns best-guess usage figures |
| GET | `/emissions/:userId/latest` | User | Get latest emission entry |
| GET | `/emissions/:userId` | User | Get all entries for user |
| DELETE | `/emissions/:id` | User | Delete an emission entry |
| GET | `/profile/:uid` | User | Get user profile |
| PUT | `/profile/:uid` | User | Update user profile |
| POST | `/goals` | User | Create a new goal |
| GET | `/goals/:userId` | User | Get all goals for user (active + achieved) |
| PATCH | `/goals/:id/progress` | User | Update a goal's progress |
| DELETE | `/goals/:id` | User | Cancel/delete a goal |

## 📄 Bill Upload

The calculator can extract usage figures directly from an uploaded utility bill PDF instead of requiring manual entry.

### What it handles

- Standard bills with an explicit usage line ("Total usage: 312 kWh", "Water consumption: 8,600 litres")
- Meter-reading-only bills — computes usage as `present reading − previous reading` when no usage line is printed
- Flat-rate bills with no usage figure at all — derives usage as `energy charge ÷ per-unit rate`, when both are printed
- South Asian–style bills that use "UNITS" instead of "kWh" (e.g. Nepal Electricity Authority)
- Units: kWh, litres, m³ (cubic metres), kL (kilolitres), and gallons — all converted to a common base before use

### Known limitations

- PDF only — a photographed or scanned bill (image with no embedded text layer) isn't supported; the PDF needs actual selectable text
- Every extracted number is shown in an editable field before it's used — the parser is a best-effort assistant, not a source of truth, since real-world bill layouts vary too much to guarantee a correct read every time

The PDF is parsed in memory and never written to disk — bills usually carry a name and address, so nothing from an upload is persisted beyond the extracted numbers.

## 🧪 Development Notes

The project uses a generated `.next` directory during development. It is safe to delete this directory when troubleshooting stale Next.js build/cache issues.

For UI changes, clear the `.next` directory and restart the development server if Next.js appears to be serving stale output.

## 📜 License

[MIT](LICENSE)
