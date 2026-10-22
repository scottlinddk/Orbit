# Shared lists

Orbit keeps shopping and to-do lists for the household itself. Every member can read and change every list. A list that only the owner may tick off would be useless at the shop.

## What a list holds

- A **list** has a name (1 to 80 characters) and a kind, `shopping` or `todo`. The kind is a label for now. A household can have 50 lists.
- An **item** has text (1 to 200 characters), an optional quantity (up to 40, free text such as `2 kg`), an optional note (up to 500), a done flag, and a position. A list holds 500 items.
- Orbit remembers who last changed an item, and when.

## Use it from the dashboard

Add the **Shopping list** widget. With no list yet it asks for a name and creates the first one. In the widget you can tick items off, add an item, and clear the ticked ones. Ticking shows at once and is undone if the server refuses. Open items are shown first. The widget re-reads the list every 30 seconds, so a wall screen follows changes made on a phone.

To show another list, choose **Edit layout**, select the widget and pick the list under **List**. A list that was deleted falls back to the first list.

## Concurrency

Edits are last write wins, per item. There is no version check: two people ticking different items never interfere, and if two edit the same item at once the later save is kept. Every change answers with the whole list, so a client can replace its copy.

## API

All under `/api/v1/households/{householdId}/lists`, for signed-in members. Another household's list or item id answers `404`, the same as an id that does not exist.

| Method and path                               | Does                                                     |
| --------------------------------------------- | -------------------------------------------------------- |
| `GET /lists`                                  | Lists with open and total item counts                    |
| `POST /lists`                                 | Create `{ name, kind }`                                  |
| `GET /lists/{listId}`                         | One list with its items in display order                 |
| `PUT /lists/{listId}/name`                    | Rename `{ name }`                                        |
| `DELETE /lists/{listId}`                      | Delete the list and its items                            |
| `POST /lists/{listId}/items`                  | Add `{ text, quantity?, note? }` at the end              |
| `PATCH /lists/{listId}/items/{itemId}`        | Change `text`, `done`, `quantity`, `note`. `null` clears |
| `DELETE /lists/{listId}/items/{itemId}`       | Remove an item                                           |
| `PUT /lists/{listId}/items/{itemId}/position` | Move to `{ index }` (0 is the top)                       |
| `POST /lists/{listId}/clear-completed`        | Remove every ticked item                                 |

Details and schemas are in `apps/api/openapi.json`.

## On a TRMNL display

A [display feed](trmnl-feed.md) can publish the open items of one list with the fields `list.name` and `list.items`.

## Other sources

Orbit's own lists map into the source-neutral `TodoList` model (`toTodoList` in `packages/domain/src/household-list.ts`). A Home Assistant `todo.*` or Grocy adapter would map into the same model. They are not built yet, and the household list store stays separate from them.
