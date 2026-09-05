# Java Coding Guidelines

This is the Java version of `GUIDELINES_TEMPLATE.md`. It preserves the same
principles and example scenarios using explicit Java types, immutable values,
and layered application boundaries. The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Guard invalid input early | Bury happy paths in nested `if/else` branches |
| Throw a precise exception now | Substitute a default and hide invalid state |
| Give a class one responsibility | Validate, transform, persist, and notify together |
| Extract repeated domain behavior | Add a hierarchy for a one-off method |
| Build only current behavior | Add speculative flags and configuration |
| Prefer immutable records/value objects | Mutate data passed by a caller |
| Validate once at an adapter | Re-validate the same command in every layer |
| Depend on ports at real seams | Construct database/HTTP clients in domain code |

## Principles

### Guard clauses

The discount example keeps the happy path shallow.

```java
double getDiscount(User user) {
    if (user == null) return 0.0;
    if (!user.active()) return 0.0;
    if (!user.hasSubscription()) return 0.0;
    return 0.2;
}
```

### Fail fast

An unknown shipping zone is invalid state, not a reason to use a default.

```java
int shippingCost(String zoneId, Map<String, Zone> zones) {
    var zone = zones.get(zoneId);
    if (zone == null) throw new IllegalArgumentException("Unknown zoneId: " + zoneId);
    return zone.baseCost();
}
```

### SRP

The user flow separates normalization, repository work, and notification.

```java
final class CreateUser {
    private final UserRepository users;
    private final Mailer mailer;
    User create(String email) {
        if (email.isBlank()) throw new IllegalArgumentException("email required");
        var user = users.save(new User(normalizeEmail(email)));
        mailer.send(user.email(), "welcome");
        return user;
    }
    private String normalizeEmail(String email) { return email.trim().toLowerCase(Locale.ROOT); }
}
```

### DRY

Extract the third repeated ticket-status normalization, not a premature helper.

```java
enum TicketStatus { OPEN, CLOSED }
TicketStatus normalizeTicketStatus(String value) { return TicketStatus.valueOf(value.toUpperCase(Locale.ROOT)); }
```

### KISS

Keep price and invoice examples limited to today's scope.

```java
String formatPrice(BigDecimal value) { return "$" + value.setScale(2); }
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice requirement that exists today. Do not add currency strategies,
recurring branches, event listeners, or cache layers without a real requirement.

```java
Invoice createInvoice(Order order) { return new Invoice(order.total(), order.items()); }
```

### Composition over inheritance

Compose behavior rather than inherit an irrelevant `fly()` operation.

```java
record Dog(BarkBehavior bark) { String makeSound() { return bark.sound(); } }
interface BarkBehavior { String sound(); }
```

### Law of Demeter

Ask the user for its city, not its address's city's name.

```java
String cityName(User user) { return user.cityName(); }
```

### Command Query Separation

Peeking and incrementing a counter are separate methods.

```java
int peekNextId(Counter counter) { return counter.value() + 1; }
void incrementCounter(Counter counter) { counter.increment(); }
```

### Explicit error handling

Retain a cause and add user-specific context; do not catch and return null.

```java
User loadUser(String id, UserApi api) {
    try { return api.get(id); }
    catch (ApiException error) { throw new IllegalStateException("Failed to load user " + id, error); }
}
```

### Immutability by default

The cart scenario returns a new record.

```java
record Cart(List<Item> items) {}
Cart addItem(Cart cart, Item item) {
    var items = new ArrayList<>(cart.items());
    items.add(item);
    return new Cart(List.copyOf(items));
}
```

### Null handling

Prefer explicit absence with `Optional` at boundaries and preserve a zero
discount as a real value.

```java
double getDiscount(Optional<User> user) {
    return user.flatMap(User::plan).map(Plan::discount).orElse(0.0);
}
```

### Testability as a design constraint

Inject `Clock` instead of asking the system clock inside domain behavior.

```java
boolean isSubscriptionExpired(Subscription subscription, Clock clock) {
    return subscription.expiresAt().isBefore(Instant.now(clock));
}
```

### Dependency direction

Invoice calculation receives an invoice rather than an SQL/JPA dependency.

```java
int calculateInvoiceTotal(Invoice invoice) {
    return invoice.items().stream().mapToInt(InvoiceItem::price).sum();
}
```

### Clear names

Use `activeSubscriptions`, `remainingDays`, and `externalId`, never `data`,
`temp`, or `obj`.

### Comments

Comments explain a delivery trade-off or an idempotency hazard, not a statement
whose name already explains it.

### No magic strings

Model order states as an enum.

```java
enum OrderStatus { PENDING_PAYMENT, PAID }
if (order.status() == OrderStatus.PENDING_PAYMENT) payments.request(order);
```

### SOLID

The welcome use case depends on a mailer port, not SMTP.

```java
interface Mailer { void send(String email, String template); }
final class SendWelcomeEmail { private final Mailer mailer; SendWelcomeEmail(Mailer mailer) { this.mailer = mailer; } }
```

### Validate once

An HTTP/message adapter builds a validated command. The application service
trusts it and never repeats the same null, type, and range checks.

```java
record UpdateProfile(String email) {}
void updateProfile(UpdateProfile command, UserRepository users) { users.update(command); }
```

Use one validation contract per body/query. When in doubt: **fail fast, keep it
flat, keep it small.**
