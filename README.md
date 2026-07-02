# AdduGenetE Shop Frontend

React + Vite ecommerce frontend for browsing products, placing orders, and managing catalog/orders from an admin dashboard.

## Tech Stack

- React 19
- Redux Toolkit + React Redux
- React Router
- Vite
- Stripe Elements
- react-hot-toast

## Features

- Product catalog and product details pages
- Cart with quantity management and checkout
- Payment flows:
	- Stripe card checkout
	- Telebirr flow
	- Cash on delivery option for Ethio database mode
- Auth flows:
	- Login/Register
	- Forgot/reset password
	- Email verification
- Admin dashboard:
	- Manage categories
	- Manage products (including image upload)
	- Manage order status and deletion
	- Low-stock alert panel with configurable threshold
	- Runtime maintenance mode ON/OFF toggle (DB-backed, no redeploy)
- Inventory safeguards:
	- Checkout is blocked if requested quantity exceeds available inventory
	- Customer gets a clear message to lower quantity
	- Stock is synced during order creation and reflected in product pages
	- Low-stock alerts shown after checkout
	- Best-effort admin low-stock email notification request

## Requirements

- Node.js >= 22.13.0
- npm

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in a `.env` file (see below).

3. Start the dev server:

```bash
npm run dev
```

## Environment Variables

Create `.env` in the project root:

```env
VITE_API_BASE_URL=http://localhost:3000/api/v1
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
VITE_ENABLE_TELEBIRR=false
VITE_MAINTENANCE_MODE_PATH=/settings/maintenance
VITE_MAINTENANCE_MODE_METHOD=PUT
```

Notes:

- If `VITE_API_BASE_URL` is not set:
	- Dev defaults to `/api/v1`
	- Production defaults to `https://easy-shop-server-wldr.onrender.com/api/v1`
- If `VITE_STRIPE_PUBLISHABLE_KEY` is missing, Stripe checkout cannot initialize.
- Set `VITE_ENABLE_TELEBIRR=true` only when the backend Telebirr env vars are configured.
- If Telebirr backend env vars are missing, keep `VITE_ENABLE_TELEBIRR=false` so checkout falls back to supported methods.
- `VITE_MAINTENANCE_MODE_PATH` defaults to `/settings/maintenance` and should match backend route.
- `VITE_MAINTENANCE_MODE_METHOD` defaults to `PUT` for admin updates.

## Available Scripts

- `npm run dev` - Start local development server
- `npm run start` - Start Vite via npx
- `npm run build` - Build production bundle
- `npm run preview` - Preview production build locally
- `npm run lint` - Run ESLint

## Inventory and Low-Stock Behavior

### Purchase Validation

Before payment/order proceeds, checkout validates cart quantities against live inventory.

- If quantity > stock:
	- Transaction is stopped
	- Customer is prompted to lower quantity
	- Payment state is cleared

### Stock Synchronization

On successful order creation, the app:

1. Calculates remaining stock per purchased product
2. Saves stock overrides locally for immediate UI consistency
3. Sends best-effort product stock update requests

### Low-Stock Threshold

- Default threshold: `5`
- Configurable from the admin dashboard low-stock panel
- Persisted in browser localStorage

### Admin Notification (Email)

When low-stock is detected after checkout, the frontend sends a best-effort notification request to one of these backend endpoints:

- `POST /orders/notify-admin-low-stock`
- `POST /notifications/low-stock`
- `POST /users/notify-admin-low-stock`

If none exists on the backend, checkout still succeeds and the app reports that admin email notification could not be confirmed.

## Routing Overview

- `/` - Home/Catalog
- `/products/:id` - Product details
- `/cart` - Cart + checkout
- `/orders` - User order history (auth required)
- `/admin` - Admin dashboard (admin auth required)
- `/login`, `/register`
- `/forgot-password`, `/reset-password`
- `/verify-email`
- `/payment/success`, `/payment/cancel`

## API Expectations

The frontend expects a backend with categories, products, orders, auth/account, and payment endpoints.

Core examples used by this app:

- `GET /products`, `GET /products/:id`, `PUT /products/:id`
- `POST /orders`, `GET /orders`, `GET /orders/get/userorders/:userId`, `PUT /orders/:id`, `DELETE /orders/:id`
- `POST /stripe/create-payment-intent`
- Auth/account endpoints for login/register/password reset/email verification

## Notes

- API requests are made through `src/api/client.js` to ensure consistent timeout, auth token, and `x-database-name` handling.
- Database selection is stored in localStorage and sent in headers to support multi-database behavior.

## Runtime Maintenance Mode

The app now supports a maintenance switch controlled from the admin dashboard.

- Status endpoint (public): `GET /api/v1/settings/maintenance`
- Toggle endpoint (admin-only): `PUT /api/v1/settings/maintenance` with body `{ "enabled": true|false }`
- Setting is persisted per selected database through `x-database-name`, so each DB can have its own maintenance state.
