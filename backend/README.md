# StockSense Backend

Node.js + Express + MongoDB backend for the StockSense Inventory Management System.

## Prerequisites

- **Node.js** ≥ 18
- **MongoDB** running locally or a remote connection URI

## Setup

1. Install dependencies (from the project root):

   ```bash
   npm install
   ```

2. Create a `.env` file in `backend/` (copy from `.env.example`):

   ```bash
   cp backend/.env.example backend/.env
   ```

3. Update `MONGO_URI` and `JWT_SECRET` in `.env`.

## Run

From the project root:

```bash
npm run dev:backend
```

Or from the `backend/` directory:

```bash
npm run dev
```

Run test suite:

```bash
npm run test --workspace=backend
```

## API Endpoints

### Health Check

| Method | Endpoint      | Access | Description  |
| ------ | ------------- | ------ | ------------ |
| GET    | `/api/health` | Public | Health check |

### Authentication & User Management

| Method | Endpoint                    | Access    | Description                                             |
| ------ | --------------------------- | --------- | ------------------------------------------------------- |
| POST   | `/api/auth/signup`          | Public    | Register new user (returns JWT token & user data)       |
| POST   | `/api/auth/login`           | Public    | Authenticate with email/password (returns JWT token)    |
| GET    | `/api/auth/me`              | Protected | Get authenticated user profile (`Bearer <token>`)       |
| POST   | `/api/auth/forgot-password` | Public    | Generate and send cryptographically secure OTP for reset|
| POST   | `/api/auth/verify-otp`      | Public    | Validate 6-digit OTP against hashed token               |
| POST   | `/api/auth/reset-password`  | Public    | Set new password using verified OTP                     |

### User Roles

- `inventory_manager`: Full administrative and configuration access.
- `warehouse_staff`: Operational inventory access (receipts, deliveries, transfers, counts).

## Environment Variables

| Variable              | Description                       | Default                                  |
| --------------------- | --------------------------------- | ---------------------------------------- |
| `PORT`                | Server port                       | `5000`                                   |
| `NODE_ENV`            | Runtime environment               | `development`                            |
| `MONGO_URI`           | MongoDB connection URI            | `mongodb://localhost:27017/stocksense`   |
| `CLIENT_URL`          | Frontend origin for CORS          | `http://localhost:5173`                  |
| `JWT_SECRET`          | Secret key for signing JWT tokens | Configured in `.env`                     |
| `JWT_EXPIRES_IN`      | JWT token lifespan                | `7d`                                     |
| `OTP_EXPIRES_MINUTES` | Password reset OTP lifespan       | `10`                                     |
