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
- Mobile-style profile dashboard with a gold account header, edit/service/sign-out
  actions, order and delivery shortcuts, privacy/account rows and support tiles.
  Customer details remain available in an expandable section. Web shortcuts use
  existing order/checkout pages. Security Settings supports the shared mobile
  authenticator/email two-factor authentication and backup-code flows.
- Mobile-inspired responsive storefront with category browsing, advanced catalog filters, featured products, and add-to-cart cards
- Store directory and storefront inventory browsing
- Mobile-style ride booking with labeled saved-address badges, map/stops review,
  regular/shared rides, vehicle selection, and pay-after-ride confirmation
- Authenticated ride quotes, ride requests, ride status, and cancellation
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
- `npm test` - Validate delivery allocation, shared fees, route coordinates, cart recovery, and ride booking contracts

## Shared mobile / web delivery

### Social sign-in and two-factor authentication

Changing the region dropdown signs the customer out and opens `/login` for the
selected region. Both the header and login store selector clear the previous
session and pending social handoff. A full navigation clears in-memory account
data; region-specific carts remain separate and the customer can sign in again.

- Website Login and Register show Google, Apple and Facebook only when the
  existing Admin > Social sign-in provider switch is ON. Settings refresh every
  30 seconds and on window focus; starting a sign-in rechecks the switch. Failed
  settings lookups hide social buttons with an error, leaving email sign-in
  available. The shared backend also enforces switches at start, callback,
  code exchange and social 2FA verification. Turning a provider off does not
  disable password sign-in or revoke existing sessions.
- OAuth uses a full-page redirect through the shared backend, with a random
  per-tab PKCE verifier. Only a short-lived handoff code returns to `/login`;
  provider tokens and client secrets never go into frontend configuration.
  The verifier is removed from session storage at exchange. Unfinished
  handoffs expire after ten minutes; 2FA challenges stay in memory only.
- The server must allow the exact website callback in its existing
  `OAUTH_APP_REDIRECT_URIS` comma-separated allowlist. **Preserve mobile entries**
  such as `addugeneteshop://auth`, and add `https://addugeneteshop.com/login`.
  Add `https://www.addugeneteshop.com/login` only if that hostname serves the
  site. For development add the actual origin and port, for example
  `http://localhost:5173/login` and `http://127.0.0.1:5173/login`.
  These are app handoff URLs, not the provider's authorized redirect URLs.
- Provider dashboards must use the shared backend callback:
  `<OAUTH_CALLBACK_BASE_URL>/users/auth/social/callback/google` (or `apple`,
  `facebook`), with the existing HTTPS API base including `/api/v1`.
  Configure provider credentials **only on the backend**:
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `FACEBOOK_CLIENT_ID` /
  `FACEBOOK_CLIENT_SECRET`, or `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`,
  `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Do not alter working mobile credentials
  without verifying their shared callback configuration. Keep each provider OFF
  until credentials, callback URLs, consent/review requirements and real sign-in
  are verified. ON is an availability switch, not a credential-health check;
  unconfigured providers return an explicit error and do not create a session.
- Profile > Security Settings supports authenticator-app enrollment with a
  **locally generated QR code** and manual key, verified-email enrollment,
  enabling/disabling 2FA, email code resend, and replacement backup codes.
  Setup secrets and backup codes are never sent to a third-party QR service or
  persisted by the frontend. Save the displayed single-use backup codes before
  closing their modal. Refreshing or browser navigation can lose unsaved codes;
  the page warns on unload and recovery options can generate replacements.
- Password and social sign-in both stop at the server's 2FA challenge until a
  valid verification or backup code is accepted. No access token or user session
  is stored for a challenge. Verification uses the original sign-in database,
  including automatic password-login region fallback.
- The existing backend auth prerequisites still apply: shared auth collections,
  `AUTH_ENCRYPTION_KEY` configuration and working email delivery for email codes.
  Expired, invalid and rate-limited requests surface server errors. Backend
  verification remains authoritative; do not enable 2FA in production without
  checking code delivery and recovery on a test account.

The website uses the existing Express API from `D:\MERN_COURSE\backend`, also
used by the mobile app at `D:\MERNMobileApp\easy_shopping`. Do not run a second
web-only delivery backend or duplicate inventory, pricing, orders or dispatch.
Point both clients to the same API deployment and select the same regional
database. The existing Vite proxy sends `/api` to `http://localhost:3001`;
start the shared backend on that port for local development, or set
`VITE_API_BASE_URL` to its `/api/v1` URL.

### Ride booking

- `/rides` follows the mobile app's Your trip, Map & stops, Select ride, and
  Trip summary flow. Regular rides support up to 12 ordered stops; shared rides
  have one pickup and one drop-off. The final drop-off passenger count is
  balanced automatically and all passengers must be accounted for.
- Every stop includes a delivery/stop label and contact phone. **Save address
  as badge** persists the address through the shared `/stores/delivery-addresses`
  API, making it reusable on both web and mobile. Selecting a badge fills the
  active stop, including its label. Label/contact edits can update a selected
  saved address; location edits detach it so saving creates a new address.
  The current account address is also offered when available in the region.
- Search suggestions and the interactive route preview use
  `VITE_GOOGLE_MAPS_BROWSER_KEY` (Maps JavaScript, Places and Routes API access).
  Without it, manual entry, saved badges and server-calculated fares still work.
  During Map & stops, clicking the map reverse-geocodes the active stop through
  the shared ride API. **Use my current location for pickup** requests browser
  location permission explicitly; denied/unavailable GPS shows an error and
  leaves manual entry available.
- Changing addresses, passengers, stop order or ride mode invalidates prices.
  The shared backend verifies addresses, calculates road fares and expires
  quotes. Selecting a vehicle or reviewing a summary does not request a driver;
  only **Request driver (pay after ride)** does. No payment is collected during
  booking. Backend ride and saved-address endpoints remain shared with mobile.

### Customer checkout

- Both cart checkout modes share the mobile-style product list: round product
  thumbnails (including gallery images), store labels, minus/plus quantity
  controls, line totals, clear-cart confirmation and a products subtotal.
  Missing or failed images use a local parcel placeholder. Proceed to Checkout
  starts the shared checkout's separate Address, Delivery, Payment and Order
  Summary screens without creating an order or payment. Address quantities are
  validated before delivery; delivery/payment choices use mobile-style cards.
  Reservation happens only after review. Back/edit actions restore this tab's
  address, allocation, currency and delivery-speed draft and require a fresh
  quote after address or speed changes. Prepared payments use their saved state.
  The cart subtotal and Proceed to Checkout button stay visible while scrolling,
  above the mobile navigation bar, so the Address step remains easy to reach
  even with a long cart.
- When `GET stores/delivery-config` returns `enabled: true`, `/cart` uses
  vehicle-based delivery instead of the legacy single-address checkout.
  Errors loading configuration are displayed, never treated as disabled.
  With the gate off, legacy main-catalog checkout remains available.
  Storefront purchases require the shared delivery gate; they cannot silently
  fall back to unconstrained catalog purchases.
- Add up to ten drop-offs, reuse/save/edit/delete private addresses, and allocate
  each cart item's whole quantities across recipients. Every unit must be
  allocated exactly once. ZIP is optional in Ethiopia.
- Standard, Express and Scheduled delivery use the shared server policy and
  saved delivery windows. The server geocodes addresses and calculates Google
  driving distances, selects stock/pickups and returns suitable vehicles.
  Missing domestic package measurements require manual vehicle selection.
- Preview fees follow the mobile nearby-store/vehicle grouping rule, including
  exact cent splitting. Server preparation revalidates and reserves stock
  atomically; the saved reservation total is authoritative.
- Domestic Ethiopia supports bank transfer and cash; domestic USA supports
  bank transfer and Stripe card payment. Native USA cash is offered only by
  Vite development builds (`import.meta.env.DEV`), with the mobile API's
  `developmentCashOnDelivery: true` preparation marker. It creates real orders;
  use test inventory. Production builds hide USA cash and block confirmation of
  development cash reservations. FX, international and service payments never
  offer cash, even in development.
- Pickup selection ranks all stock/price-eligible stores, including the default
  store, by distance to the verified delivery destination. Whole-cart stock and
  storefront-family rules still apply. Existing orders retain their pickup;
  recalculate an unprepared quote after deploying backend ranking changes.
  Driver pickup navigation starts at live driver GPS and ends at that assigned
  pickup; drop-off navigation goes from driver GPS to the recipient. Driver
  navigation does not silently substitute a store or browser-chosen starting
  point when GPS is unavailable.
- The cart's **Payment currency & destination** selector also offers Ethiopia
  purchases paid in USD and USA products paid in birr and shipped to Ethiopia.
  Both reuse the mobile API's daily FX policy. New quotes/reservations require
  an enabled rate applied strictly under 24 hours ago; prepared payments retain
  their saved rate and amount even when the policy later expires or is disabled.
- Ethiopia USD product/service payments support explicitly USD-tagged bank
  accounts and, when enabled by the API, the dedicated Ethiopia USD Stripe
  merchant. Converted card payments never substitute the native merchant key.
  Cash is excluded. Product/service costs stay ETB; USD payments divide by the
  saved birr-per-USD rate.
- USA-to-Ethiopia checkout accepts Ethiopian recipients, reserves US inventory
  and routes US pickups only to the consolidation hub. Shipping is charged once
  per recipient using the server's weight/volume tariff, including final
  Ethiopian delivery but excluding customs/duties. Products, hub route fees and
  shipping remain USD; their combined total is converted to ETB. Payment is
  **ETB bank transfer only** using explicitly ETB-tagged accounts in the USA
  database. Submitted transfers enter `bank_review`, keep stock reserved, and
  block fulfillment until Admin verifies the actual funds. Never pay again
  while a receipt is under review.
- `/service-requests` offers **Accept Admin quote & pay in USD** for eligible
  ETB-quoted Ethiopia services and a resume link for existing payments. Service
  totals come only from the saved Admin quote, not the cart. Service payments
  never remove cart items. Submitted/paid service cancellation requires support
  review and manual refund handling; no automatic service refund is provided.
- `/delivery-checkouts/:id` resumes a quote/reservation, including one created
  on mobile. The browser saves the quote ID before reservation or payment.
  Before calculating a new route/quote, the browser verifies that saved ID with
  the server. Unreserved quotes can be replaced; missing or cancelled records no
  longer block checkout. Completed purchases reconcile the cart. Unpaid
  reservations and bank transfers under review retain their resume/status link
  and duplicate-payment protection, even when their expiry time has passed.
  Network/authorization failures do not silently discard payment recovery data.
  Checkout errors have a labeled red alert; active previous-checkout notices
  use an amber warning with a clearly marked recovery link.
  On interrupted requests, refresh that checkout rather than start another
  payment. Card payments use the group's existing server PaymentIntent;
  bank transfer submits one combined sender/reference. Only purchased cart
  quantities are removed on placement (or export bank-review submission), with
  persisted completion IDs to prevent repeated cart removal after refresh.
- `/delivery-checkouts` shows saved receipts, child deliveries, cancellations,
  refund status and live driver markers/status (15-second polling).
  It also shows converted payment receipts, saved rates, international recipient
  shipments, carrier/tracking details and milestone history. A US driver
  delivery marked complete means arrival at the hub, not final Ethiopian delivery.

Nearby stores can share a delivery **price**, but fulfillment and tracking
remain per store, exactly as in the current mobile/backend implementation.
This does not introduce a new optimized consolidated multi-stop dispatch model.

### Admin and company driver operations

- `/admin/delivery`: configure shared vehicle activation, capacities and regional
  route rates, delivery-speed policies, optional product package measurements,
  and existing company drivers' vehicle type/assignment availability. Account
  onboarding/approval stays in the existing mobile/Admin API flow.
- `/admin/delivery-payments`: inspect combined bank receipts, confirm actual
  received funds, cancel child deliveries, reconcile Stripe refunds and record
  bank refunds already sent. Confirmation is never proof of payment by itself:
  Admin must verify funds in the actual bank account.
- `/admin/international-payments`: configure this region's independent FX
  enablement/provider/automation, apply or fetch a daily rate, and inspect
  history/failures. Saving settings does not renew a rate. In the USA region,
  also configure the server-geocoded US hub, shipping tariff/limits and explicit
  per-product export approval. Only approve legally shippable products with
  complete accurate measurements. No carrier booking is made automatically.
- Admin bank-account forms explicitly select USD or ETB and list both
  currencies. At `/admin/delivery-payments`, verify/reject international bank
  receipts and advance shipments sequentially:
  `awaiting_hub -> at_hub -> shipped -> arrived_ethiopia -> delivered`.
  The server requires paid orders and completed US hub pickups; export requires
  carrier/tracking and final delivery requires a proof/recipient-confirmation note.
- `/driver/deliveries`: approved company-driver accounts see the same offers and
  ordered active queue as mobile, claim/reroute/reject offers, confirm pickup,
  request Google driving routes for the current leg, and confirm recipient
  drop-off. Server permissions and dispatch eligibility remain authoritative.
  GPS sharing is opt-in and stops when disabled or the page unmounts. It uses
  the mobile company's `rides/me/location` endpoint; keep the page open.
  Browser background tracking is not guaranteed. This is not the partner-driver
  marketplace dashboard.

### Setup and rollout

1. On the shared backend, configure `GOOGLE_MAPS_API_KEY` for **Geocoding** and
   **Distance Matrix**, and `GOOGLE_ROUTES_API_KEY` for **Routes API**, with
   billing and appropriate server restrictions. These keys never belong in
   frontend environment variables. Google failures are displayed; no
   straight-line pricing or route fallback is used.
2. Complete the backend's existing per-store inventory migration in each region
   using its documented Admin/mobile flow (replica-set transactions required).
   Verify approved/open pickup stores, real pickup coordinates and inventory.
   This web implementation does not run migrations or enable production gates.
3. Configure active regional bank accounts, Stripe merchant keys for USA,
   approved company drivers and vehicle compatibility. Enable vehicles and
   shared delivery through Admin only after these prerequisites are ready.
   For Ethiopia USD cards, configure `STRIPE_SECRET_KEY_ETHIOPIA_USD` and
   `STRIPE_PUBLISHABLE_KEY_ETHIOPIA_USD` on the backend with the matching live
   USD-capable merchant; the server supplies the public key after reservation.
   For cross-currency purchases, configure the region's FX policy and
   matching-currency bank accounts. For USA exports, also configure hub/tariff,
   complete packaged measurements and explicit product export approvals.
4. Optionally set `VITE_GOOGLE_MAPS_BROWSER_KEY` to a **separate**, HTTP-referrer
   restricted key with **Maps JavaScript API**, **Routes API**, and
   **Places API (New)** enabled,
   and enable billing. The preview uses the current JavaScript Routes library,
   not Directions API (Legacy), which is unavailable to new Cloud projects.
   This adds
   embedded pickup/drop-off/driver markers, in-app driving-route previews and
   the driver's server-returned Google road polyline. Browser previews never
   replace server pricing, and supplied driver polylines avoid another browser
   directions request. Route-preview failures are shown explicitly.
   Without the browser key, external Google Maps navigation links still work;
   they open a new tab. Rebuild/restart the frontend after configuring the key.
   The directions action uses a wrapping block layout so it cannot overlap
   adjacent delivery details on narrow screens.
   Browser GPS requires HTTPS or localhost and location permission.
5. Validate real Google routes, Mongo transaction concurrency, dispatch,
   mobile/web cross-device status updates and live payment/refund recovery in
   staging before rollout. Unit and mocked browser tests do not validate live
   Google authorization, database deployment or bank funds.

### Browser Google Maps setup

Route previews draw the returned Routes API path with a Maps JavaScript
polyline, without depending on the route object's `createPolylines` helper.
Renaming a key's display name in Google Cloud does not change its value.
If production reports "This page didn't load Google Maps correctly", inspect
the browser console for the specific Google Maps error code; route-rendering
errors and key authorization errors are separate problems.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select
   a project and link a billing account. Enable **Maps JavaScript API**,
   **Routes API**, and **Places API (New)** in APIs & Services > Library.
2. In APIs & Services > Credentials, create an API key for the website only.
   Under **Application restrictions**, select **Websites (HTTP referrers)**.
   For production, allow `https://addugeneteshop.com/*`. Add
   `https://www.addugeneteshop.com/*` only if that hostname serves the website.
   Under **API restrictions**, restrict the key to **Maps JavaScript API**,
   **Routes API**, and **Places API (New)**. Save the restrictions.
3. Prefer a second browser key for development, restricted to the same APIs and
   your actual development addresses, such as `http://localhost:5173/*` and
   `http://127.0.0.1:5173/*`. If Vite chooses another port, explicitly allow that
   origin too. Do not change the mobile or backend keys or their restrictions.
4. Create or edit the Git-ignored `.env.local` in this frontend directory:

   ```dotenv
   VITE_GOOGLE_MAPS_BROWSER_KEY=YOUR_RESTRICTED_DEVELOPMENT_BROWSER_KEY
   ```

   Replace the placeholder locally; do not commit the key or paste it into chat.
   Restart `npm run dev`. For production, set the same variable to the production
   browser key in the frontend hosting provider's **build environment**, then
   rebuild and redeploy. Vite embeds `VITE_` values in the built browser code:
   this key is public, so referrer/API restrictions are essential.
5. Configure billing budget alerts and appropriate API quotas. Budget alerts do
   not impose a spending cap. Open checkout's Delivery stage and confirm that
   both the map and driving route render. If authorization fails, check the
   browser console and Google Cloud metrics without sharing key-bearing URLs.
   Common causes are an unlisted hostname/port, a disabled API, inactive billing,
   or restrictions that have not propagated yet.

### Delivery and ride address suggestions

The shared address autocomplete is available for each delivery drop-off,
legacy shipping checkout, and ride pickup/drop-off. Look for the input showing "Search pickup location" or
"Search drop-off location". These hints appear when the field is empty;
existing addresses remain visible and editable. Type at least three
characters, then choose a Google suggestion with the mouse or Arrow keys and
Enter. Escape closes suggestions. Selection fills street, city, postal code
and country while preserving apartment/unit and contact details. Delivery and
ride drafts also retain the selected place ID and coordinates; the backend
still verifies destinations and calculates authoritative routes and prices.
Editing address fields clears the selected place metadata to avoid routing
to an old pin. Suggestions are restricted to USA or Ethiopia when the address
country matches those regions, including Ethiopian export recipients.

Enable **Places API (New)** and add it to both browser keys' API restrictions.
Suggestions use debounced requests and a separate billing session per input.
Without a browser key, or when lookup fails, manual entry remains available
with an explicit notice. Google performs the suggestion/detail lookups, so
normal Google Maps usage charges and terms apply.

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
- `/stores`, `/stores/:id` - Store directory and storefront product listings
- `/rides`, `/rides/mine` - Ride booking quotes and ride history (sign-in required)
- `/orders` - User order history (auth required)
- `/admin` - Admin dashboard (admin auth required)
- `/login`, `/register`
- `/forgot-password`, `/reset-password`
- `/verify-email`
- `/payment/success`, `/payment/cancel`

Storefront inventory can be browsed on the website, but the existing web checkout does not yet support store-specific inventory reservations. Use the mobile app to purchase those items. Ride booking and status updates use the shared ride API; live map tracking and post-trip payment remain in the mobile app.

## Google OAuth branding links and policy deployment

### Admin social sign-in switches

The Admin Dashboard's **Social sign-in** panel reads and updates
`/settings/social-login`. Google, Apple, and Facebook each have an independent
toggle. Only authenticated admins can save partial boolean maps such as
`{ "providers": { "google": true } }`; omitted providers are unchanged.
Each switch applies across all regions and development/production clients
connected to the same backend, stored in its default database. New settings
default to OFF. Existing shared switch values are inherited until each provider
is explicitly saved, preserving current availability during upgrade.

Deploy the backend setting endpoints before deploying this dashboard and the
matching mobile update. Existing mobile login screens refresh within 30 seconds
while open and on focus/foreground; the backend blocks disabled social flows
for the selected provider at start, callback, handoff exchange, and social-origin 2FA completion. Email
sign-in and existing sessions remain available. The website currently provides
email login, not provider sign-in buttons; this panel manages the shared service.
Provider credentials and callbacks must still be configured separately.
Old admin clients can still submit `{ "enabled": true/false }` to set all three
providers together; update both admin clients to use independent toggles. New
clients require the provider-map response, so deploy the backend first.

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
