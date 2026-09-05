# JavaScript Coding Guidelines

This is the JavaScript rendition of `GUIDELINES_TEMPLATE.md`. It keeps every
principle and teaching scenario from the template, expressed for modern
ECMAScript and Node.js. Read it together with the shared template before any
code-writing operation.

## Quick reference

| Do | Don't |
| --- | --- |
| Exit invalid paths early | Bury the happy path in nested `if/else` blocks |
| Throw on broken invariants | Substitute defaults that hide corrupted state |
| Separate validation, transformation, persistence, and notification | Put unrelated responsibilities in one function |
| Extract a repeated domain rule | Generalize a one-off helper |
| Keep today's invoice and price requirements small | Add options for hypothetical future features |
| Return replacement values | Mutate parameter-owned arrays or objects |
| Validate transport input once at the boundary | Repeat the same checks in services and helpers |
| Name domain literals once | Scatter status strings and event names |

## Principles

### Guard clauses

```js
// Bad — the real path is buried
function getDiscount(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasSubscription) return 0.2;
    }
  }
  return 0;
}

// Good — flat and explicit
function getDiscount(user) {
  if (!user) return 0;
  if (!user.isActive) return 0;
  if (!user.hasSubscription) return 0;
  return 0.2;
}
```

### Fail fast

```js
// Bad — a bad zone id is hidden
function getShippingCost(order) {
  return ZONES[order.zoneId] ?? ZONES.default;
}

// Good — preserve the violated invariant
function getShippingCost(order) {
  const zone = ZONES[order.zoneId];
  if (!zone) throw new Error(`Unknown zoneId: ${order.zoneId}`);
  return zone.baseCost;
}
```

### SRP

Keep the user scenario split into validation, normalization, persistence, and
notification. A coordinator may compose these units, but should not conceal
their responsibilities.

```js
function validateUser(data) {
  if (!data.email) throw new Error('email required');
}
function normalizeUser(data) {
  return { ...data, email: data.email.trim().toLowerCase() };
}
async function createUser(data, users, mailer) {
  validateUser(data);
  const user = await users.insert(normalizeUser(data));
  await mailer.send(user.email, 'welcome');
  return user;
}
```

### DRY

Extract ticket-status normalization only after it is a repeated domain rule,
not because two unrelated strings happen to be trimmed the same way.

```js
const TICKET_STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed' });
function normalizeTicketStatus(value) {
  if (Object.values(TICKET_STATUS).includes(value)) return value;
  throw new Error(`Unknown ticket status: ${value}`);
}
```

### KISS

The price example solves only the current requirement. Do not add locale
strategies or configuration objects without a present use.

```js
function formatPrice(value) {
  return `$${value.toFixed(2)}`;
}
```

### YAGNI

The invoice example solves only the current requirement. Do not add recurring
billing flags, multi-currency branches, or future configuration without a
present use.

```js
function createInvoice(order) {
  return { total: order.total, items: order.items };
}
```

### Composition, Demeter, and CQS

Compose only useful behavior, ask immediate collaborators for their own data,
and keep a query separate from mutation.

```js
const canBark = { makeSound: () => 'Woof' };
const dog = { ...canBark };

function getCityName(user) {
  return user.getCityName();
}
function peekNextId(counter) {
  return counter.value + 1;
}
function incrementCounter(counter) {
  counter.value += 1;
}
```

### Explicit errors, immutability, and nulls

```js
async function loadUser(id, api) {
  try {
    return await api.getUser(id);
  } catch (error) {
    throw new Error(`Failed to load user ${id}`, { cause: error });
  }
}

function addItem(cart, item) {
  return { ...cart, items: [...cart.items, item] };
}

function getPlanDiscount(user) {
  return user?.plan?.discount ?? 0;
}
```

Use one documented absence convention. Do not overload `null` or `undefined`
to represent distinct business states when an explicit value is clearer.

### Testability as a design constraint

Inject time and infrastructure dependencies rather than reaching for globals.

```js
function isSubscriptionExpired(subscription, now) {
  return subscription.expiresAt < now;
}
```

### Dependency direction

Domain calculations receive domain data instead of constructing SQL, HTTP, or
mail clients themselves.

```js
function calculateInvoiceTotal(invoice) {
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}
```

### Clear names

Use `activeSubscriptions`, `remainingDays`, and `externalId`, not `data`,
`temp`, or `x`.

### Comments

Explain only non-obvious trade-offs and hazards. Do not narrate a line whose
name and structure already make it clear.

### No magic strings

Name statuses once rather than scattering literals:

```js
const ORDER_STATUS = Object.freeze({
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
});
```

### SOLID

Depend on a mailer port where the infrastructure can vary:

```js
class SendWelcomeEmail {
  constructor(mailer) {
    this.mailer = mailer;
  }
  execute(user) {
    return this.mailer.send(user.email, 'welcome');
  }
}
```

### Validate once

Parse and validate a request body at its transport boundary. Services trust the
validated command and do not repeat required, type, or range checks.

```js
function parseUpdateProfile(body) {
  if (typeof body?.email !== 'string' || body.email.length === 0) {
    throw new Error('email required');
  }
  return { email: body.email };
}
async function updateProfile(command, users) {
  await users.update(command);
}
```

When in doubt: **fail fast, keep it flat, keep it small.**
