# Python Coding Guidelines

This is the Python version of `GUIDELINES_TEMPLATE.md`. It preserves the same
principles and example scenarios with typed Python, explicit boundaries, and
Python testing conventions. The shared baseline remains mandatory.

## Quick reference

| Do | Don't |
| --- | --- |
| Return early for invalid state | Hide the happy path inside nested branches |
| Raise precise errors immediately | Use a default to hide a broken invariant |
| Give each function one reason to change | Validate, transform, save, and notify together |
| Extract real repeated domain logic | Add abstractions before they earn a second use |
| Keep inputs immutable by default | Surprise callers by changing their objects |
| Validate once at transport boundaries | Repeat body/query validation in every layer |
| Inject time and infrastructure | Reach for global clients in domain code |
| Use enums and named constants | Spread protocol strings around the codebase |

## Principles

### Guard clauses

The discount scenario is flat and typed.

```python
def get_discount(user: User | None) -> float:
    if user is None:
        return 0.0
    if not user.is_active:
        return 0.0
    if not user.has_subscription:
        return 0.0
    return 0.2
```

### Fail fast

Never conceal a bad zone key with a default zone.

```python
def shipping_cost(zone_id: str, zones: dict[str, Zone]) -> int:
    zone = zones.get(zone_id)
    if zone is None:
        raise ValueError(f"Unknown zone_id: {zone_id}")
    return zone.base_cost
```

### SRP

The user flow separates normalization, persistence, and notification.

```python
def normalize_email(email: str) -> str:
    return email.strip().lower()

def create_user(email: str, users: UserRepository, mailer: Mailer) -> User:
    if not email:
        raise ValueError("email required")
    user = users.insert(email=normalize_email(email))
    mailer.send(user.email, "welcome")
    return user
```

### DRY

Extract the third repeated ticket-status normalization, not a helper created
for a single call.

```python
class TicketStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"

def normalize_ticket_status(value: str) -> TicketStatus:
    return TicketStatus(value)
```

### KISS

Keep price and invoice code focused on the current requirement.

```python
def format_price(value: float) -> str:
    return f"${value:.2f}"
```

### YAGNI (You Aren't Gonna Need It)

Build the invoice required today. Do not introduce strategy trees, recurring
invoices, or multiple currencies until the requirement exists.

```python
def create_invoice(order: Order) -> Invoice:
    return Invoice(total=order.total, items=order.items)
```

### Composition over inheritance

Compose a dog's bark behavior rather than inherit an unrelated `fly` method.

```python
@dataclass(frozen=True)
class Dog:
    bark: Callable[[], str]

    def make_sound(self) -> str:
        return self.bark()
```

### Law of Demeter

Ask the user for a city instead of traversing `user.address.city.name`.

```python
def city_name(user: User) -> str:
    return user.city_name()
```

### Command Query Separation

Querying the next ID does not increment it.

```python
def peek_next_id(counter: Counter) -> int: return counter.value + 1
def increment_counter(counter: Counter) -> None: counter.increment()
```

### Explicit error handling

Attach context and preserve the original exception.

```python
def load_user(user_id: str, api: UserApi) -> User:
    try:
        return api.get_user(user_id)
    except ApiError as error:
        raise RuntimeError(f"Failed to load user {user_id}") from error
```

### Immutability by default

The cart example returns a replacement dataclass.

```python
def add_item(cart: Cart, item: Item) -> Cart:
    return replace(cart, items=(*cart.items, item))
```

### Null handling

Use `None` consistently and preserve a zero discount.

```python
def get_discount(user: User | None) -> float:
    return 0.0 if user is None or user.plan is None else user.plan.discount
```

### Testability as a design constraint

Pass the clock to the subscription check.

```python
def is_subscription_expired(subscription: Subscription, now: datetime) -> bool:
    return subscription.expires_at < now
```

### Dependency direction

The invoice calculation receives an invoice, not a database connection.

```python
def calculate_invoice_total(invoice: Invoice) -> int:
    return sum(item.price for item in invoice.items)
```

### Clear names

Use `active_subscriptions`, `remaining_days`, and `external_id`, never
`data`, `temp`, or `obj`.

### Comments

Comments document a provider delivery trade-off or an idempotency hazard,
never narrate the next statement.

### No magic strings

Name order states once.

```python
class OrderStatus(StrEnum):
    PENDING_PAYMENT = "pending_payment"
    PAID = "paid"

if order.status is OrderStatus.PENDING_PAYMENT:
    request_payment(order)
```

### SOLID

The welcome use case depends on a mailer protocol, not SMTP.

```python
class Mailer(Protocol):
    def send(self, email: str, template: str) -> None: ...

class SendWelcomeEmail:
    def __init__(self, mailer: Mailer) -> None: self._mailer = mailer
```

### Validate once

Parse HTTP/message input into a typed command at the boundary. Application
services trust that command instead of repeating the same required, type, and
range checks. Use one schema or validator for each body/query.

```python
@dataclass(frozen=True)
class UpdateProfile:
    email: str

def update_profile(command: UpdateProfile, users: UserRepository) -> None:
    users.update(command)
```

When in doubt: **fail fast, keep it flat, keep it small.**
