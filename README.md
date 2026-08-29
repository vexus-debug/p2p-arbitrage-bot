# P2P Arbitrage Bot

Build a Nigerian P2P Crypto Arbitrage Scanner

Build a production-quality web application that scans P2P cryptocurrency markets across 5 platforms and identifies genuine price-difference opportunities where I can:

BUY crypto cheaply on Platform A → SELL the same crypto at a higher price on Platform B.

This is a READ-ONLY arbitrage scanner. Do not execute trades, send funds, release crypto, or interact with users. The application is strictly for market-data aggregation and opportunity detection.

1. Supported P2P platforms

Create separate API connectors/adapters for:

Bybit P2P

Bitget P2P

OKX P2P

NoOnes

LocalCoinSwap

Use each platform's official API/documentation where available.

Do NOT scrape websites if an official API is available.

Architect the connectors independently so that if one platform's API is unavailable, restricted, rate-limited, or fails, the remaining platforms continue working.

Each connector should have:

API base URL

authentication configuration if required

endpoint configuration

request interval/rate limit handling

response normalization

error handling

connection status

last successful update timestamp

Store API credentials securely as environment variables/secrets. Never expose API keys in frontend code.

2. Primary market

The initial market should be:

USDT / NGN

Design the system so additional assets can later be enabled:

USDC/NGN

BTC/NGN

ETH/NGN

and other supported assets

Do not hard-code the architecture around USDT only.

3. MOST IMPORTANT: BUY AND SELL LOGIC

The scanner must understand the difference between:

BUY

The price at which I can BUY crypto from a P2P advertiser.

SELL

The price at which I can SELL crypto to a P2P advertiser.

Do NOT simply compare arbitrary displayed prices.

For every platform, normalize advertisements into:

platform
asset
fiat
side
price
available_quantity
min_order
max_order
payment_methods
merchant_name
merchant_completion_rate
merchant_order_count
timestamp


Normalize all platforms into the same structure.

4. ARBITRAGE CALCULATION

The fundamental opportunity is:

BUY LOW → SELL HIGH

Example:

Platform A

BUY USDT
₦1,500

Platform B

SELL USDT
₦1,530


The scanner should identify:

BUY:  Platform A @ ₦1,500
SELL: Platform B @ ₦1,530


Gross spread:

₦1,530 - ₦1,500 = ₦30


Percentage spread:

(1530 - 1500) / 1500 × 100
= 2.00%


Display:

2.00% gross arbitrage

The reverse direction must also be checked.

For example:

Platform B BUY @ ₦1,505
Platform A SELL @ ₦1,525


The scanner must independently detect that opportunity.

Therefore, for every pair of platforms:

Platform A → Platform B
Platform B → Platform A


must both be evaluated.

5. CHECK EVERY PLATFORM AGAINST EVERY OTHER PLATFORM

Do NOT only compare one platform against another predetermined platform.

With 5 platforms, compare every possible directional combination.

Example:

Bybit → Bitget
Bybit → OKX
Bybit → NoOnes
Bybit → LocalCoinSwap

Bitget → Bybit
Bitget → OKX
Bitget → NoOnes
Bitget → LocalCoinSwap

OKX → Bybit
OKX → Bitget
OKX → NoOnes
OKX → LocalCoinSwap

NoOnes → Bybit
NoOnes → Bitget
NoOnes → OKX
NoOnes → LocalCoinSwap

LocalCoinSwap → Bybit
LocalCoinSwap → Bitget
LocalCoinSwap → OKX
LocalCoinSwap → NoOnes


Do not compare a platform with itself.

The engine must automatically generate these combinations so adding a sixth platform later requires no major rewrite.

6. LIQUIDITY IS CRITICAL

Do NOT report a price difference simply because one advertiser has a cheap price.

Example:

Platform A

₦1,500
Available: ₦10,000

Platform B

₦1,530
Available: ₦5,000,000


This is only a ₦10,000-sized opportunity.

The scanner must calculate the maximum executable amount.

For example:

Maximum executable USDT =
minimum(
    buy_available_quantity,
    sell_available_quantity,
    user_capital
)


Also respect:

minimum order

maximum order

available advertiser quantity

available liquidity

7. AGGREGATE MULTIPLE ADS

Do not only use the single cheapest advertiser.

Build an order-book-like P2P view.

Example:

BUY SIDE

₦1,500 — 100 USDT
₦1,502 — 300 USDT
₦1,505 — 1,000 USDT

SELL SIDE

₦1,530 — 200 USDT
₦1,528 — 500 USDT
₦1,525 — 2,000 USDT


Allow the user to specify capital:

₦50,000
₦100,000
₦500,000
₦1,000,000
₦5,000,000


Calculate whether the entire intended trade size can actually be executed.

8. PAYMENT METHOD MATCHING

Payment method is extremely important for P2P.

An opportunity should not automatically be considered executable if:

BUY requires Bank Transfer
SELL requires an unsupported payment method


Display the payment methods on both sides.

Allow users to filter by:

Bank Transfer

Opay

PalmPay

Moniepoint

Kuda

other available payment methods

Create a setting:

"Only show opportunities with compatible payment methods."

9. PROFIT CALCULATION

For every opportunity calculate:

Buy price
Sell price
Gross spread
Gross spread %
Trade size
Gross NGN profit
Platform fees
Estimated transaction costs
Estimated slippage
Estimated net profit
Net ROI %


Formula:

Gross Profit =
(Sell Price - Buy Price) × Executable Quantity


Then:

Net Profit =
Gross Profit
- Buy Fees
- Sell Fees
- Estimated Transaction Costs
- Estimated Slippage


If a fee is unknown, clearly label it:

Fee unknown

Do not invent a fee.

10. OPPORTUNITY CARD

Each detected opportunity should be displayed as a clear card.

Example:

🔥 P2P ARBITRAGE

BUY
NoOnes
₦1,500 / USDT

↓

SELL
Bybit
₦1,530 / USDT

Gross Spread
2.00%

Executable Amount
500 USDT

Capital Required
₦750,000

Gross Profit
₦15,000

Estimated Net Profit
₦12,800

Payment Method
Bank Transfer

Opportunity Age
4 seconds

BUY advertiser
★★★★★
98.7% completion

SELL advertiser
★★★★★
99.2% completion


The direction must be visually unmistakable:

BUY HERE → SELL THERE

11. OPPORTUNITY STATUS

Every opportunity should have a status:

🟢 ACTIVE

Both prices are current and the spread remains above the user's minimum threshold.

🟡 STALE

One or both prices have not updated recently.

🔴 EXPIRED

The opportunity disappeared or the spread fell below the threshold.

Define configurable freshness limits.

For example:

Fresh: < 5 seconds
Aging: 5–15 seconds
Stale: > 15 seconds


Make these configurable because different APIs have different update speeds.

12. MINIMUM SPREAD FILTER

Allow the user to set:

Minimum gross spread:
0.10%
0.25%
0.50%
1%
2%
5%
Custom


Also provide:

Minimum net profit

Example:

Only show opportunities with:
Net ROI ≥ 0.50%
AND
Net profit ≥ ₦5,000


13. FALSE-OPPORTUNITY PROTECTION

The scanner must aggressively prevent false arbitrage signals.

Before displaying an opportunity, verify:

Buy price is current.

Sell price is current.

Both advertisements still exist.

Sufficient quantity exists.

Minimum/maximum order limits allow the trade size.

Payment methods are visible.

Prices belong to the same asset.

Both prices are denominated in NGN.

Buy side and sell side are correctly interpreted.

The spread survives estimated fees.

The opportunity has not already expired.

Never display:

"2.5% arbitrage"

if the actual executable spread is only 0.1%.

14. REAL-TIME SCANNING

Create a live scanner.

The interface should automatically update whenever new API data arrives.

Display:

Last update:
Bybit       2 sec ago
Bitget      1 sec ago
OKX         4 sec ago
NoOnes      2 sec ago
LocalCoinSwap 6 sec ago


Show API connection health.

Example:

● Bybit       Connected
● Bitget      Connected
● OKX         Connected
● NoOnes      Connected
● LocalCoinSwap Connected


If an API fails:

⚠ Bitget temporarily unavailable
Last successful update: 21 seconds ago


Do not crash the entire scanner.

15. DASHBOARD

Create a professional trading-terminal-style dashboard.

Main sections:

Top statistics

ACTIVE OPPORTUNITIES
BEST SPREAD
BEST NET PROFIT
TOTAL PLATFORMS ONLINE
LAST SCAN


Main table

Columns:

Asset
BUY FROM
BUY PRICE
SELL TO
SELL PRICE
SPREAD %
EXECUTABLE SIZE
GROSS PROFIT
NET PROFIT
PAYMENT METHOD
AGE
STATUS


Sort automatically by:

Highest net profit

Allow sorting by:

Spread %

Net profit

Executable amount

Platform

Asset

Opportunity age

16. PLATFORM MATRIX

Create a matrix showing price differences between every platform.

Example:

BUY ↓ / SELL → Bybit Bitget OKX NoOnes LocalCoinSwap Bybit — +0.4% +0.7% +1.1% +0.8% Bitget +0.2% — +0.5% +0.9% +0.6% OKX +0.3% +0.1% — +0.8% +0.4% NoOnes +0.5% +0.4% +0.3% — +0.2% LocalCoinSwap +0.4% +0.3% +0.2% +0.1% —

Each cell means:

Buy from row → Sell to column

This is important.

17. HISTORICAL DATA

Store detected opportunities.

Allow the user to see:

timestamp

platforms

asset

buy price

sell price

spread

liquidity

duration

whether it disappeared

maximum observed spread

Create:

Opportunity History

This lets me determine whether an apparent arbitrage actually persists.

For example:

Opportunity
Bybit → NoOnes

First detected:
14:02:11

Highest spread:
2.14%

Average spread:
1.31%

Duration:
3m 42s

Maximum executable:
$740


18. OPPORTUNITY LIFETIME

Track how long every opportunity remains valid.

When an opportunity disappears, record:

First detected
Last detected
Duration
Maximum spread
Average spread
Maximum executable volume


This is important because I want to learn whether Nigerian P2P arbitrage opportunities last seconds, minutes, or hours.

19. ALERTS

Allow optional alerts for:

Spread > X%
Net profit > ₦X
Executable amount > X
Specific platform combination
Specific asset


Initially support browser notifications.

Architect the alert system so Telegram/WhatsApp notifications can be added later.

20. USER SETTINGS

Create:

Capital available
Minimum spread
Minimum net profit
Maximum trade size
Preferred assets
Preferred payment methods
Minimum merchant completion rate
Minimum merchant order count
Maximum opportunity age


Example:

Capital:
₦500,000

Minimum spread:
0.50%

Minimum completion rate:
95%

Maximum opportunity age:
10 seconds


The scanner should use these settings when ranking opportunities.

21. API ARCHITECTURE

Use a modular adapter architecture.

Example:

P2PProvider
    ├── BybitProvider
    ├── BitgetProvider
    ├── OKXProvider
    ├── NoOnesProvider
    └── LocalCoinSwapProvider


Every provider should return the same normalized structure.

Example:

interface P2PAd {
  platform: string;
  asset: string;
  fiat: string;
  side: "BUY" | "SELL";
  price: number;
  availableQuantity: number;
  minOrder: number;
  maxOrder: number;
  paymentMethods: string[];
  merchantName: string;
  completionRate?: number;
  orderCount?: number;
  timestamp: number;
}


Then the arbitrage engine should operate on normalized data rather than platform-specific responses.

This makes adding new exchanges easy.

22. IMPORTANT BUY/SELL SEMANTICS

Be extremely careful with API terminology.

Different platforms may define P2P BUY and SELL from the advertiser's perspective rather than the user's perspective.

Normalize everything to the user's perspective:

USER_BUY
=
user buys crypto from advertiser

USER_SELL
=
user sells crypto to advertiser


Do not mix these up.

The final scanner must always clearly say:

BUY FROM PLATFORM A

and

SELL TO PLATFORM B

23. NO TRADE EXECUTION

This version is a scanner only.

Do NOT:

place orders

automatically buy crypto

automatically sell crypto

send bank payments

release escrow

withdraw crypto

manage user funds

Only collect market data and identify opportunities.

24. UI DESIGN

Use a dark professional trading-terminal interface.

Prioritize:

readability

real-time updates

dense information

clear BUY/SELL direction

green for profitable opportunities

red for negative/unprofitable opportunities

yellow for warnings/stale data

Do not make it look like a generic SaaS landing page.

The primary screen should feel like an arbitrage terminal.

Responsive design is required for desktop and mobile.

25. SECURITY

API keys must never be exposed client-side.

Use backend/server-side API requests.

Store secrets securely.

Validate all external API responses.

Implement rate-limit handling.

Implement retries with exponential backoff.

Log API errors without exposing secrets.

Never trust advertiser data blindly.

26. DELIVERABLE

Build the complete application with:

Live P2P API aggregation.

Five platform connectors.

NGN/USDT scanning.

Correct BUY → SELL arbitrage logic.

Every platform compared against every other platform.

Liquidity-aware calculations.

Payment-method filtering.

Net-profit calculations.

Real-time opportunity detection.

Opportunity expiry tracking.

Historical opportunity database.

Platform health monitoring.

Arbitrage matrix.

Configurable user filters.

Mobile-responsive trading-terminal UI.

Clean modular architecture for adding more platforms later.

The most important requirement is:

Do not show a price difference as an arbitrage opportunity unless the application can identify a realistic BUY price, SELL price, executable quantity, and current advertisement on both sides.

The scanner's primary output must always answer four questions:

1. WHERE DO I BUY?

2. WHERE DO I SELL?

3. HOW MUCH CAN I ACTUALLY TRADE?

4. HOW MUCH CAN I ACTUALLY MAKE?

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d1be9134-6b36-4ea8-9bf8-5969f1baa76f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
