# TypeScript Coding Guidelines

This is the TypeScript version of `GUIDELINES_TEMPLATE.md`. It preserves the
same principles, decisions, and example scenarios, expressed with strict
TypeScript. The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Early return on bad input | Pyramid `if/else` nesting |
| Explicit error, fail now | Fallbacks that hide a broken invariant |
| One responsibility per unit | Validate, transform, persist, and notify together |
| Extract repeated domain logic | Abstract before a second real use |
| Ship the simplest solution | Add speculative layers or configuration |
| Return new values | Mutate caller-owned input |
| Validate once at the edge | Re-validate the same contract in every layer |
| Use named types and constants | Scatter magic literals |

## Principles

### Guard clauses

Keep the same discount scenario flat and typed.

```ts
// Bad
function getDiscount(user?: { active: boolean; subscriber: boolean }): number {
  if (user) { if (user.active) { if (user.subscriber) return 0.2; } }
  return 0;
}

// Good
function getDiscount(user?: { active: boolean; subscriber: boolean }): number {
  if (!user) return 0;
  if (!user.active) return 0;
  if (!user.subscriber) return 0;
  return 0.2;
}
```

### Fail fast

Never substitute a default zone for an impossible domain key.

```ts
const zones: Record<string, { baseCost: number }> = { local: { baseCost: 5 } };
function shippingCost(zoneId: string): number {
  const zone = zones[zoneId];
  if (zone === undefined) throw new Error(`Unknown zoneId: ${zoneId}`);
  return zone.baseCost;
}
```

### SRP

Split validation, normalization, persistence, and notification.

```ts
function normalizeEmail(email: string): string { return email.trim().toLowerCase(); }
async function createUser(email: string, users: UserRepository, mailer: Mailer): Promise<void> {
  if (email.length === 0) throw new Error('email required');
  const user = await users.insert({ email: normalizeEmail(email) });
  await mailer.send(user.email, 'welcome');
}
```

### DRY

Extract only repeated domain behavior. One formatting call is not a reusable
abstraction; three identical ticket-status normalizations are.

```ts
type TicketStatus = 'open' | 'closed';
function normalizeTicketStatus(value: string): TicketStatus {
  if (value === 'open' || value === 'closed') return value;
  throw new Error(`Unknown ticket status: ${value}`);
}
```

### KISS

Keep the price and invoice scenarios limited to today's requirement.

```ts
function formatPrice(value: number): string { return `$${value.toFixed(2)}`; }
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice requirement that exists today; do not add recurrence,
multi-currency branches, or a future configuration object.

```ts
function createInvoice(order: { total: number; items: readonly string[] }) {
  return { total: order.total, items: order.items };
}
```

Do not add locale strategies, recurring options, or multi-currency branches
without a requirement.

### Composition over inheritance

Compose only needed behavior instead of inheriting unrelated methods.

```ts
const canBark = { makeSound: () => 'Woof' };
const canFly = { fly: () => 'Flying' };
const dog = { ...canBark };
const bird = { ...canBark, ...canFly };
```

### Law of Demeter

Ask the immediate collaborator for a city name instead of reaching through a
deep object graph.

```ts
interface User { cityName(): string; }
function getCityName(user: User): string { return user.cityName(); }
```

### Command Query Separation

Keep reading the next identifier separate from incrementing it.

```ts
function peekNextId(counter: { value: number }): number { return counter.value + 1; }
function incrementCounter(counter: { value: number }): void { counter.value += 1; }
```

### Explicit error handling

Add context and retain the cause; never return `null` merely because a request
failed.

```ts
async function loadUser(id: string, api: Api): Promise<User> {
  try { return await api.getUser(id); }
  catch (error) { throw new Error(`Failed to load user ${id}`, { cause: error }); }
}
```

### Immutability by default

Use readonly data and make the cart scenario return a replacement value.

```ts
interface Cart { readonly items: readonly string[]; }
function addItem(cart: Cart, item: string): Cart {
  return { ...cart, items: [...cart.items, item] };
}
```

### Null and undefined handling

Use one documented convention and preserve legitimate zero values.

```ts
function getDiscount(user?: { plan?: { discount: number } }): number {
  return user?.plan?.discount ?? 0;
}
```

### Testability as a design constraint

Inject time, APIs, and repositories rather than reaching for globals.

```ts
function isSubscriptionExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt < now;
}
```

### Dependency direction

Domain calculations receive domain data, not a concrete SQL connection.

```ts
function calculateInvoiceTotal(invoice: { items: readonly { price: number }[] }): number {
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}
```

### Clear names

Use `activeSubscriptions`, `remainingDays`, and `externalId`, never `data`,
`temp`, or `x`.

### Comments

Comments explain a non-obvious trade-off or hazard, not the next line of code.
A TODO needs a tracked issue.

### No magic strings

Name order states once and reuse their contract.

```ts
const ORDER_STATUS = { pendingPayment: 'pending_payment', paid: 'paid' } as const;
if (order.status === ORDER_STATUS.pendingPayment) await requestPayment(order);
```

### SOLID

Use ports where variation is real; do not couple a welcome-email use case to
SMTP.

```ts
interface Mailer { send(email: string, template: string): Promise<void>; }
class SendWelcomeEmail {
  constructor(private readonly mailer: Mailer) {}
  execute(email: string): Promise<void> { return this.mailer.send(email, 'welcome'); }
}
```

### Validate once

Parse the transport payload at the boundary into a typed command. Services
trust that command rather than repeating the same required, type, and range
checks. Keep one schema or validator per body/query.

```ts
interface UpdateProfile { readonly email: string; }
function updateProfile(input: UpdateProfile, users: UserRepository): Promise<void> {
  return users.update(input);
}
```

When in doubt: **fail fast, keep it flat, keep it small.**
