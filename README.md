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
	- Bank transfer option for Ethio database mode
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
VITE_HOME_GENERAL_GRAPHIC_URL=
```

Notes:

- If `VITE_API_BASE_URL` is not set:
	- Dev defaults to `/api/v1`
	- Production defaults to `https://easy-shop-server-wldr.onrender.com/api/v1`
- If `VITE_STRIPE_PUBLISHABLE_KEY` is missing, Stripe checkout cannot initialize.
- Set `VITE_ENABLE_TELEBIRR=true` only when the backend Telebirr env vars are configured.
- If Telebirr backend env vars are missing, keep `VITE_ENABLE_TELEBIRR=false` so checkout falls back to supported methods.
- Telebirr checkout is live-only: mock Telebirr responses are rejected and orders will not be placed.
- `VITE_MAINTENANCE_MODE_PATH` defaults to `/settings/maintenance` and should match backend route.
- `VITE_MAINTENANCE_MODE_METHOD` defaults to `PUT` for admin updates.
- `VITE_HOME_GENERAL_GRAPHIC_URL` controls the Home page graphic shown above the featured products section.
- If `VITE_HOME_GENERAL_GRAPHIC_URL` is missing or fails to load, Home page falls back to `src/assets/hero.png`.

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

- `/privacy.html`, `/terms.html`, `/account-deletion.html` - Public static legal pages (no login or API access required)
- `/privacy-policy` - Legacy app route opening `/privacy.html`, including during maintenance
- `/` - Home/Catalog
- `/products/:id` - Product details
- `/cart` - Cart + checkout
- `/orders` - User order history (auth required)
- `/admin` - Admin dashboard (admin auth required)
- `/login`, `/register`
- `/forgot-password`, `/reset-password`
- `/verify-email`
- `/payment/success`, `/payment/cancel`

## Google OAuth branding links and policy deployment

### Admin social sign-in switch

The Admin Dashboard's **Social sign-in** panel reads and updates
`/settings/social-login`. Only authenticated admins can save its boolean
`enabled` field. It defaults to OFF and controls Google, Apple, and Facebook
together across all regions, development and production clients connected to
the same backend. The value is stored once in the backend's default database,
not copied into each region.

Deploy the backend setting endpoints before deploying this dashboard and the
matching mobile update. Existing mobile login screens refresh within 30 seconds
while open and on focus/foreground; the backend blocks disabled social flows
at start, callback, handoff exchange, and social-origin 2FA completion. Email
sign-in and existing sessions remain available. The website currently provides
email login, not provider sign-in buttons; this panel manages the shared service.
Provider credentials and callbacks must still be configured separately.

After reviewing the policy and Terms of Service, run `npm run build` and deploy
the resulting `dist` directory to the existing `addugeneteshop.com` website.
Vite copies the legal pages from `public` into `dist`; deploy the entire output,
not just the JavaScript assets. The existing Apache configuration lets real files
pass through before the SPA fallback. On other hosts, ensure these HTML files
are served before the catch-all SPA rewrite.

Use these exact public URLs in Google Auth Platform > Branding:

- Application home page: `https://addugeneteshop.com/`
- Privacy policy: `https://addugeneteshop.com/privacy.html`
- Terms of service: `https://addugeneteshop.com/terms.html`
- Authorized domain: `addugeneteshop.com` (no scheme or path)

Verify ownership of `addugeneteshop.com` in Google Search Console using an account
associated with the Google Cloud project. Add the requested DNS TXT record at
your DNS provider without replacing existing email, hosting, or verification
records. Hosting these pages on your existing site does not require switching
DNS to GitHub Pages.

Check all URLs in a private browser window after deployment. They must be
publicly accessible over HTTPS, match the app's identity, and show the actual
policy rather than the SPA's not-found page. The homepage footer links to the
policies. Review the terms with the business/legal operator before publishing;
no universal refund deadline, arbitration requirement, or governing jurisdiction
has been invented.

Branding URLs are not OAuth callbacks. Keep the web OAuth client's redirect URI
aligned with the backend's exact Google callback URL. If that backend uses a
different host, verify Google's authorized-domain requirements for that host
separately; do not change callbacks to the policy page.

The mobile app's `assets/common/legalLinks.js` now points to these domain URLs.
Deploy the public pages before releasing the mobile update. The mobile repository
also retains GitHub Pages policy copies; keep shared disclosures consistent when
changing either copy. This deployment does not change backend authentication.

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
