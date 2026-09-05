# PHP Laravel Coding Guidelines

This is the PHP Laravel version of `GUIDELINES_TEMPLATE.md`. It preserves the
same decisions and teaching scenarios using strict PHP, Laravel boundaries,
and Laravel's testing conventions. The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Guard invalid input early | Nest the happy path in `if/else` pyramids |
| Throw precise exceptions | Fall back to a default that hides bad state |
| Keep controller, use case, and infrastructure separate | Validate, persist, and notify in one method |
| Extract repeated domain behavior | Build a service for one use |
| Use immutable value data where practical | Mutate caller-owned arrays or models invisibly |
| Validate in a Form Request once | Repeat its rules in services |
| Inject interfaces at real seams | Construct facades or clients in domain logic |
| Use named enums/constants | Repeat status strings |

## Principles

### Guard clauses

The discount example stays flat.

```php
function getDiscount(?User $user): float
{
    if ($user === null) return 0.0;
    if (! $user->isActive()) return 0.0;
    if (! $user->hasSubscription()) return 0.0;
    return 0.2;
}
```

### Fail fast

Do not silently choose a default shipping zone.

```php
function shippingCost(string $zoneId, ZoneRepository $zones): int
{
    $zone = $zones->find($zoneId);
    if ($zone === null) throw new DomainException("Unknown zoneId: {$zoneId}");
    return $zone->baseCost();
}
```

### SRP

The user flow keeps validation, normalization, persistence, and notification
as distinct responsibilities.

```php
final class CreateUser
{
    public function __construct(private UserRepository $users, private Mailer $mailer) {}
    public function handle(CreateUserData $data): void
    {
        $user = $this->users->create($data->withEmail(strtolower(trim($data->email))));
        $this->mailer->send($user->email, 'welcome');
    }
}
```

### DRY

Extract the third repeated ticket-status normalization, not a one-off helper.

```php
enum TicketStatus: string { case Open = 'open'; case Closed = 'closed'; }
function normalizeTicketStatus(string $value): TicketStatus { return TicketStatus::from($value); }
```

### KISS

Keep the price and invoice examples limited to their actual requirements.

```php
function formatPrice(float $value): string { return '$'.number_format($value, 2); }
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice shape needed today; do not add multi-currency, recurrence,
queues, events, or cache abstractions without a current use case.

```php
function createInvoice(Order $order): array { return ['total' => $order->total, 'items' => $order->items]; }
```

### Composition over inheritance

Use focused services and value objects instead of a base class that forces a
dog to inherit `fly()`.

```php
final class Dog { public function __construct(private BarkBehavior $bark) {} public function sound(): string { return $this->bark->sound(); } }
```

### Law of Demeter

Ask the user for its city instead of chaining relations.

```php
function cityName(User $user): string { return $user->cityName(); }
```

### Command Query Separation

Keep peeking at an identifier separate from incrementing a counter.

```php
function peekNextId(Counter $counter): int { return $counter->value() + 1; }
function incrementCounter(Counter $counter): void { $counter->increment(); }
```

### Explicit error handling

Translate infrastructure failures with context; do not catch and return null.

```php
function loadUser(string $id, UserApi $api): User
{
    try { return $api->get($id); }
    catch (Throwable $error) { throw new RuntimeException("Failed to load user {$id}", 0, $error); }
}
```

### Immutability by default

Return a replacement cart or DTO rather than changing the caller's collection.

```php
function addItem(CartData $cart, ItemData $item): CartData
{
    return new CartData([...$cart->items, $item]);
}
```

### Null handling

Use explicit nullable contracts and preserve a legitimate zero discount.

```php
function getDiscount(?User $user): float { return $user?->plan()?->discount() ?? 0.0; }
```

### Testability as a design constraint

Inject the clock rather than calling `now()` inside domain behavior.

```php
function isSubscriptionExpired(Subscription $subscription, DateTimeImmutable $now): bool
{
    return $subscription->expiresAt() < $now;
}
```

### Dependency direction

Use cases receive repositories or domain data; domain code never constructs
Eloquent queries or reads `Request` globals.

```php
function calculateInvoiceTotal(Invoice $invoice): int
{
    return array_sum(array_map(fn (InvoiceItem $item) => $item->price(), $invoice->items()));
}
```

### Clear names

Use `$activeSubscriptions`, `$remainingDays`, and `$externalId`; avoid `$data`,
`$temp`, and `$result`.

### Comments

Comments explain a hidden trade-off or an idempotency hazard, never narrate a
line of PHP.

### No magic strings

Use a backed enum for the order state scenario.

```php
enum OrderStatus: string { case PendingPayment = 'pending_payment'; case Paid = 'paid'; }
if ($order->status === OrderStatus::PendingPayment) { $payments->request($order); }
```

### SOLID

Depend on a mailer contract, not an SMTP implementation in a use case.

```php
interface Mailer { public function send(string $email, string $template): void; }
final class SendWelcomeEmail { public function __construct(private Mailer $mailer) {} }
```

### Validate once

The Form Request owns HTTP validation; the service trusts its validated DTO.

```php
final class UpdateProfileRequest extends FormRequest { public function rules(): array { return ['email' => ['required', 'email']]; } }
final class UpdateProfile { public function handle(UpdateProfileData $data): void { /* persist $data */ } }
```

Use one validation contract per body/query. When in doubt: **fail fast, keep it
flat, keep it small.**
