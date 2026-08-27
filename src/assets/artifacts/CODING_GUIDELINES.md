# Coding Guidelines

How to write code in this repo: the principles and style rules every change must follow.

## Quick reference

Each row is expanded, with examples, in the matching section below.

| Do                                                 | Don't                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Early return on bad input                          | Pyramid `if/else` nesting                                                                   |
| Explicit error, fail now                           | Multiple fallbacks that hide the real failure                                               |
| One responsibility per unit                        | Validate + transform + persist + notify in one place                                        |
| Extract when duplication repeats                   | Abstract before a second real use                                                           |
| Ship the simplest solution for the current problem | Add layers, hooks, or config "just in case"                                                 |
| Build only what's needed today                     | Add fields/params/branches for a future case that hasn't arrived                            |
| Compose small, focused units                       | Build deep inheritance chains for unrelated behavior                                        |
| Talk only to immediate collaborators               | Reach through several levels of another object's internal structure                         |
| A function either does or returns, not both        | Mix a side effect into what looks like a getter                                             |
| Validate once at the edge                          | Re-validate the same invariant in every layer                                               |
| One validator per input                            | Two validators for the same body/query                                                      |
| Let errors surface with context                    | Swallow errors in an empty or generic `catch`, or catch-and-continue as if nothing happened |
| Return new values instead of mutating input        | Mutate parameters and hide the side effect from the caller                                  |
| One consistent meaning per null/undefined          | Overload null/undefined to mean several different business states                           |
| Inject dependencies so units are easy to test      | Hardcode dependencies that force hitting real infra to test                                 |
| Inner layers depend on nothing outward             | Let domain logic import framework/DB/HTTP details directly                                  |
| Names that reveal role or domain meaning           | Vague names (`data`, `info`, `temp`, `result`, `obj`)                                       |
| Named const / enum / contract for domain literals  | Magic strings scattered through the codebase                                                |
| Depend on interfaces/ports where variation is real | Couple a use case directly to a concrete implementation                                     |
| Comments only for important non-obvious intent     | Narrating comments, noise, or stale TODOs                                                   |

## Principles

### Guard clauses

Validate and exit early. Prefer flat control flow over deep nesting. Keep the happy path at the end, at the shallowest indent level.

```js
// Bad — pyramid nesting, happy path buried
function getDiscount(user) {
  if (user) {
    if (user.isActive) {
      if (user.hasSubscription) {
        return 0.2;
      } else {
        return 0;
      }
    } else {
      return 0;
    }
  } else {
    return 0;
  }
}

// Good — guard clauses, happy path at the end, shallow indent
function getDiscount(user) {
  if (!user) return 0;
  if (!user.isActive) return 0;
  if (!user.hasSubscription) return 0;
  return 0.2;
}
```

### Fail fast

Invalid input, impossible state, or a broken dependency should fail immediately with a clear error. Prefer that over chains of fallbacks, silent defaults, or "keep going somehow."

**Relationship to "Validate once":** fail fast applies to type and state invariants that should never happen if upstream contracts hold (a required field is `null`, an enum has an impossible value). It is not license to re-check business rules the boundary already validated — that's re-validation, not fail-fast. If a downstream failure reveals that an upstream contract was violated, fix or harden the boundary; do not add a second check that quietly duplicates it.

```js
// Bad — silent fallback hides a broken invariant
function getShippingCost(order) {
  const zone = ZONES[order.zoneId] || ZONES.default; // hides a bad zoneId
  return zone.baseCost;
}

// Good — fails immediately with a clear error
function getShippingCost(order) {
  const zone = ZONES[order.zoneId];
  if (!zone) throw new Error(`Unknown zoneId: ${order.zoneId}`);
  return zone.baseCost;
}
```

### SRP

A function, class, or module has one reason to change. If it does two jobs, split it.

```js
// Bad — validates, transforms, persists, and notifies all in one place
async function saveUser(data) {
  if (!data.email) throw new Error('email required');
  const normalized = { ...data, email: data.email.trim().toLowerCase() };
  await db.users.insert(normalized);
  await mailer.send(normalized.email, 'welcome');
}

// Good — each unit has a single reason to change
function validateUser(data) {
  if (!data.email) throw new Error('email required');
}
function normalizeUser(data) {
  return { ...data, email: data.email.trim().toLowerCase() };
}
async function createUser(data) {
  validateUser(data);
  const user = normalizeUser(data);
  await db.users.insert(user);
  await notifyWelcome(user.email);
  return user;
}
```

### DRY

Do not copy logic that means the same thing. Extract only when duplication is real — not as premature abstraction.

**Practical rule:** extract when at least 2 of these 3 conditions hold:

- The same logic appears **3 or more times** (twice is tolerated; the third confirms the pattern).
- A future change to the business rule would need to be applied in **all** places at once (if not, it's not real duplication, just coincidence).
- The copied code represents the **same domain concept**, not just similar-looking code.

**Not real duplication (do not extract):**

- Two validations that look alike today but belong to different concepts (e.g. validating a user's email vs a vendor's email) — they'll likely diverge later.
- Boilerplate required by the surrounding structure (e.g. two handlers with the same shape because the calling convention requires it), where the shape is imposed from outside and not a domain decision.

**Example:**

```ts
// Bad: extracted prematurely, only one real use
function formatName(x: string) { return x.trim().toUpperCase(); }

// Good: appears 3 times with the same domain meaning → extract
function normalizeTicketStatus(status: string): TicketStatus { ... }
```

### KISS

Ship the simplest solution that solves the current problem. No extra layers, hooks, or configurability "just in case."

```js
// Bad — configurability nobody asked for, added "just in case"
function formatPrice(
  value,
  { currency = 'USD', locale = 'en-US', showSymbol = true, roundingStrategy = 'nearest' } = {},
) {
  // ...unneeded logic for a single real use case
}

// Good — solves the current problem, nothing more
function formatPrice(value) {
  return `$${value.toFixed(2)}`;
}
```

### YAGNI (You Aren't Gonna Need It)

Build only what the current requirement needs. Don't add fields, params, branches, or abstractions for a future case that hasn't arrived. This differs from KISS: KISS is about keeping the _chosen_ solution simple; YAGNI is about not building things nobody asked for yet.

```js
// Bad — speculative support for a case that doesn't exist yet
function createInvoice(order, { supportsRecurring = false, supportsMultiCurrency = false } = {}) {
  // ...branches for features no client uses today
}

// Good — build for the requirement that actually exists
function createInvoice(order) {
  return { total: order.total, items: order.items };
}
```

### Composition over inheritance

Prefer composing small, focused units (functions, objects, mixins) over deep inheritance chains. Inheritance couples subclasses to implementation details of their parent and tends to break when requirements diverge.

```js
// Bad — inheritance forces unrelated behavior onto every subclass
class Animal {
  makeSound() {
    throw new Error('not implemented');
  }
  fly() {
    throw new Error('not implemented');
  }
}
class Dog extends Animal {
  makeSound() {
    return 'Woof';
  }
  // forced to inherit `fly`, which makes no sense for a Dog
}

// Good — compose only the behaviors that apply
const canBark = { makeSound: () => 'Woof' };
const canFly = { fly: () => 'Flying' };
const dog = { ...canBark };
const bird = { ...canBark, ...canFly };
```

### Law of Demeter (don't talk to strangers)

A unit should only interact with its immediate collaborators, not reach through them to grab something several levels deep. Deep chains couple you to structure that isn't yours to know.

```js
// Bad — reaches through three levels of internal structure
function getCityName(user) {
  return user.address.city.name;
}

// Good — ask the object for what you need, let it own its structure
function getCityName(user) {
  return user.getCityName();
}
```

### Command Query Separation (CQS)

A function either **does** something (command, causes a side effect) or **returns** something (query) — not both. Mixing the two makes call sites unpredictable: you can't tell if calling something is safe to do twice.

```js
// Bad — returns a value AND causes a side effect
function getNextId(counter) {
  counter.value++; // side effect hidden inside a "getter"
  return counter.value;
}

// Good — separate the query from the command
function peekNextId(counter) {
  return counter.value + 1;
}
function incrementCounter(counter) {
  counter.value++;
}
```

### Explicit error handling

Let errors surface with context instead of swallowing them. An empty or generic `catch` hides the real failure and makes debugging production issues much harder.

```js
// Bad — swallows the error, no context, execution continues as if nothing happened
async function loadUser(id) {
  try {
    return await api.getUser(id);
  } catch (e) {
    return null; // caller has no idea a failure occurred
  }
}

// Good — the error surfaces with context, caller decides how to handle it
async function loadUser(id) {
  try {
    return await api.getUser(id);
  } catch (e) {
    throw new Error(`Failed to load user ${id}: ${e.message}`, { cause: e });
  }
}
```

### Immutability by default

Prefer creating new values over mutating existing ones, especially for data passed as a parameter. Mutation hides side effects and makes state changes hard to trace, particularly in reactive systems.

```js
// Bad — mutates the input, callers get a surprise side effect
function addItem(cart, item) {
  cart.items.push(item);
  return cart;
}

// Good — returns a new value, caller's original data stays untouched
function addItem(cart, item) {
  return { ...cart, items: [...cart.items, item] };
}
```

### Null/undefined handling

Pick one convention and apply it consistently: e.g. `undefined` for "not yet set" and `null` for "explicitly empty," or vice versa — the specific choice matters less than not mixing both for the same meaning. Don't use `null`/`undefined` as a stand-in for a business state that deserves its own explicit value.

```js
// Bad — null is overloaded to mean three different things
function getDiscount(user) {
  if (!user) return null; // no user
  if (!user.plan) return null; // no plan
  if (user.plan.discount === 0) return null; // legitimately zero discount
}

// Good — each case is explicit, zero is a real value
function getDiscount(user) {
  if (!user || !user.plan) return 0;
  return user.plan.discount;
}
```

### Testability as a design constraint

Code that's easy to test is usually well-designed: side effects are isolated, dependencies are injected rather than hardcoded, and units do one thing. If a function is hard to test, that's often a signal the design needs to change, not a signal to skip the test.

```js
// Bad — hardcoded dependency, can't test without hitting the real clock/API
function isSubscriptionExpired(subscription) {
  return subscription.expiresAt < new Date();
}

// Good — dependency is injected, trivial to test with a fixed date
function isSubscriptionExpired(subscription, now = new Date()) {
  return subscription.expiresAt < now;
}
```

### Dependency direction

Inner layers (domain/business logic) must not depend on outer layers (frameworks, databases, HTTP clients). Outer layers depend inward, never the reverse. This keeps business rules testable and portable independent of infrastructure choices.

```js
// Bad — domain logic imports directly from an infrastructure detail
import { MysqlConnection } from '../infra/mysql';
function calculateInvoiceTotal(invoiceId) {
  const invoice = new MysqlConnection().query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}

// Good — domain logic depends only on the shape of the data, not its source
function calculateInvoiceTotal(invoice) {
  return invoice.items.reduce((sum, item) => sum + item.price, 0);
}
```

### Clear names

Variables, parameters, functions, and types must say what they hold or do. Prefer domain words over vague fillers (`data`, `info`, `item`, `temp`, `result`, `obj`, `val`, `x`). If the honest name is long, that is fine — a short vague name is not.

```js
// Bad — vague names that hide the domain meaning
function process(data) {
  const temp = data.filter((x) => x.val > 0);
  return temp;
}

// Good — names reveal role and domain meaning
function getActiveSubscriptions(subscriptions) {
  return subscriptions.filter((subscription) => subscription.remainingDays > 0);
}
```

### Comments

Do not leave comments that add no value. Prefer clear names and structure so the code explains itself. Comment only what is genuinely important and non-obvious: why a trade-off was made, a constraint the reader would miss, or a hazard that names alone cannot carry. Delete narration, restatements of the next line, and leftover TODOs that no longer mean anything.

**Examples:**

```ts
// Bad — narrates the obvious
// increment the counter by 1
counter++;

// Bad — restates what the name already says
// get the user by id
const user = getUserById(id);

// Good — explains a non-obvious trade-off
// We poll instead of using a webhook because the provider doesn't
// guarantee single delivery; downstream dedupe would cost more than polling.
setInterval(checkPaymentStatus, 5000);

// Good — warns of a hazard the name can't carry
// WARNING: this endpoint is only idempotent if `externalId` comes from
// the client; if we generate it ourselves, retries create duplicate records.
```

**Quick test before writing a comment:** if deleting it leaves the code just as clear, the comment isn't earning its place.

### No magic strings

Do not hard-code domain or protocol literals inline (status values, roles, path fragments, error codes, event names). Name them once — const, enum, shared contract, or map — and reuse that name. Exception: one-off strings with no reuse and no domain meaning (e.g. a single log label) may stay inline if a named constant would only obscure them.

```js
// Bad — domain literals scattered across the codebase
if (order.status === 'pending_payment') {
  /* ... */
}
// ...elsewhere, in a different file
if (order.status === 'pending_payment') {
  /* ... */
}

// Good — named once, reused everywhere
const ORDER_STATUS = {
  PENDING_PAYMENT: 'pending_payment',
  PAID: 'paid',
  CANCELLED: 'cancelled',
};
if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
  /* ... */
}
```

### SOLID

Apply with judgment. Favor single responsibility and inversion of dependencies (ports/adapters) where variation is real. Do not force every SOLID letter into every small file.

```js
// Bad — the use case depends directly on a concrete implementation
class SendWelcomeEmail {
  async execute(user) {
    await new SmtpMailer().send(user.email, 'welcome'); // coupled to SMTP
  }
}

// Good — depends on an interface (port), not the implementation
class SendWelcomeEmail {
  constructor(mailer) {
    this.mailer = mailer;
  } // mailer implements MailerPort
  async execute(user) {
    await this.mailer.send(user.email, 'welcome');
  }
}
```

### Validate once

Validate at the boundary (the first function, layer, or contract that owns the input). Downstream code should trust that contract — do not re-check the same emptiness, type, or range in helpers, use cases, or adapters further in.

Bad smell: hand-rolled parsers that trim/null-check/re-parse what the boundary already guarantees, or a second layer validating the same rule again "just in case."

When a shared schema (or equivalent single contract) defines the input, that schema is the **single source of truth**. Do not stack a second validator for the same invariants. Documentation types or interface shapes may mirror the contract, but they must not re-enforce the same rules.

```php
// Bad — the FormRequest already validates, and the Service re-checks the same rule
class UpdateProfileRequest extends FormRequest {
    public function rules() {
        return ['email' => 'required|email'];
    }
}
class ProfileService {
    public function update(array $data) {
        if (empty($data['email'])) { // redundant re-validation
            throw new \InvalidArgumentException('email required');
        }
        $this->user->update($data);
    }
}

// Good — the Service trusts the contract already validated by the FormRequest
class ProfileService {
    public function update(array $validated) {
        $this->user->update($validated);
    }
}
```

| Do                                                                                 | Don't                                                      |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Parse once at the edge; pass a typed command/query inward                          | Re-parse or re-check the same rules in every layer         |
| One validation approach per input                                                  | Two mechanisms validating the same body/query              |
| Keep docs/interface metadata separate from the validation contract when both exist | Duplicate the same type/range/required rules in two places |

When in doubt: **fail fast, keep it flat, keep it small.**
