# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

## Land Price API Configuration

Backend `GET /api/land-price` endpoint can aggregate multiple external providers.

Useful endpoints:
- `GET /api/land-price`
- `GET /api/land-price/sources`
- `GET /api/land-price/providers-health`
- `GET /api/land-price/compare`
- `GET /api/land-price/history`
- `GET /api/land-price/listings`
- `POST /api/land-price/listings`
- `POST /api/land-price/listings/import`
- `DELETE /api/land-price/listings/:id`
- `GET /api/news`
  - Query: `limit`, `perFeed`, `force=1`
- `GET /api/trade/summary`
- `GET /api/trade/listings`
- `POST /api/trade/listings`
- `PATCH /api/trade/listings/:id`
- `GET /api/trade/offers`
- `POST /api/trade/offers`
- `PATCH /api/trade/offers/:id`
- `POST /api/trade/offers/:id/counter`
- `POST /api/trade/offers/:id/accept`
- `GET /api/trade/orders`
- `PATCH /api/trade/orders/:id`
- `GET /api/trade/orders/:id/contract`
- `GET /api/trade/orders/:id/contract.pdf`
- `GET /api/trade/orders/:id/shipping-status`
- `POST /api/trade/orders/:id/shipping-sync`
- `POST /api/trade/shipping/sync-all`
- `GET /api/trade/shipping/providers`
- `GET /api/trade/shipping/providers-health`
- `GET /api/trade/shipping/providers-config`
- `GET /api/trade/alerts`
- `GET /api/soil`
- `GET /api/soil/sources`

- `LAND_PRICE_API_URL_1..5`
  - URL template, placeholders: `{city}`, `{district}`, `{crop}`, `{lat}`, `{lon}`
- `LAND_PRICE_API_<n>_PRICE_PATH`
  - Dot path for price field (example: `data.price_tl_da`)
- `LAND_PRICE_API_<n>_METHOD`
  - `GET` (default) or `POST`
- `LAND_PRICE_API_<n>_PRIORITY`
  - Lower runs earlier (default: slot order).
- `LAND_PRICE_API_<n>_WEIGHT`
  - Weight used in multi-provider consensus.
- `LAND_PRICE_API_<n>_HEADERS_JSON`
  - Optional request headers as JSON string.
- `LAND_PRICE_API_<n>_BODY_TEMPLATE`
  - Optional body template for `POST` providers (`{city}`, `{district}`, `{crop}`, `{lat}`, `{lon}` placeholders).
- `LAND_PRICE_API_<n>_MIN_PATH`
  - Dot path for min value (optional)
- `LAND_PRICE_API_<n>_MAX_PATH`
  - Dot path for max value (optional)
- `LAND_PRICE_API_<n>_UPDATED_AT_PATH`
  - Dot path for update timestamp (optional)
- `LAND_PRICE_API_PROVIDERS_JSON`
  - Optional JSON array for extra providers.
- `LAND_DISCOVERY_ENABLED`
  - `true/false`. When enabled, backend also scans public search pages for TL price signals.
- `LAND_DISCOVERY_TIMEOUT_MS`
  - Timeout per discovery source request.
- `LAND_DISCOVERY_MAX_SOURCES`
  - Max search URLs to scan.
- `LAND_DISCOVERY_ENGINES`
  - Comma list: `duckduckgo,bing,google,yandex`
- `LAND_PROVIDER_TIMEOUT_MS`
  - Timeout for each configured provider request.

Example:

```bash
LAND_PRICE_API_URL_1="https://example.com/land?city={city}&crop={crop}"
LAND_PRICE_API_1_PRICE_PATH="data.price_tl_da"
LAND_PRICE_API_1_MIN_PATH="data.min_tl_da"
LAND_PRICE_API_1_MAX_PATH="data.max_tl_da"
LAND_PRICE_API_1_UPDATED_AT_PATH="data.updatedAt"
```

Manual listing example:

```bash
curl -X POST http://127.0.0.1:5051/api/land-price/listings \
  -H "Content-Type: application/json" \
  -d '{
    "city":"Malatya",
    "district":"Yesilyurt",
    "crop":"domates",
    "priceTlDa":185000,
    "title":"Sahadan manuel ilan",
    "url":"https://www.sahibinden.com/..."
  }'
```

## Shipping Provider Adapter Configuration

Shipping adapter supports provider specific API + parser override by env vars.

Provider ids: `ptt`, `yurtici`, `mng`, `aras`, `ups`

- `SHIPPING_PROVIDER_<ID>_API_URL`
- `SHIPPING_PROVIDER_<ID>_API_KEY`
- `SHIPPING_PROVIDER_<ID>_STATUS_PATH`
- `SHIPPING_PROVIDER_<ID>_CODE_PARAM`
- `SHIPPING_PROVIDER_<ID>_STATUS_PATHS`
  - comma list for response mapping (example: `data.status,result.status`)
- `SHIPPING_PROVIDER_<ID>_EVENT_PATHS`
  - comma list for event mapping
- `SHIPPING_PROVIDER_<ID>_CODE_PATHS`
  - comma list for tracking code mapping

Example:

```bash
SHIPPING_PROVIDER_YURTICI_API_URL="https://api.example.com/yurtici"
SHIPPING_PROVIDER_YURTICI_API_KEY="secret-token"
SHIPPING_PROVIDER_YURTICI_STATUS_PATH="/shipment/status"
SHIPPING_PROVIDER_YURTICI_CODE_PARAM="cargoKey"
SHIPPING_PROVIDER_YURTICI_STATUS_PATHS="data.shipmentStatus,result.status"
SHIPPING_PROVIDER_YURTICI_EVENT_PATHS="data.lastEvent,message"
SHIPPING_PROVIDER_YURTICI_CODE_PATHS="data.cargoKey,trackingCode"
```

## Soil Internet Sources

`/api/soil` endpoint now enriches data with multiple internet sources when coordinates are available:
- ISRIC SoilGrids (soil properties)
- Open-Meteo Geocoding (city -> coord fallback)
- Open-Meteo Forecast (soil moisture/temperature + ET signals)
- MTA layer service (if configured)

If `coords` is not provided, backend tries Open-Meteo geocoding by `city`.
