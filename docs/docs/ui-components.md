# UI Components

## Buttons

### Primary
- Background: `--color-primary`
- Text: use a contrast-checked foreground; default recommendation is `--color-text-primary` on orange
- Hover: `--color-primary-hover`
- Use for the most important action in a section.

### Secondary
- Background: white or transparent
- Border: `--color-border`
- Text: `--color-text-primary`
- Use for alternate actions.

### Destructive
- Use semantic danger tokens.
- Include explicit action text such as “Hapus”.
- Ask for confirmation when the action is irreversible.

## Place cards

Recommended content:
1. Photo
2. Place name
3. Category or location
4. Short useful detail
5. Rating or price only if sourced and available
6. Clear action to view details

Use a white surface, subtle border, and consistent image ratio. Avoid excessive badges.

## Category chips

- Default: neutral surface and text
- Selected: warm orange tint with dark warm text
- Keep labels short and recognizable
- Do not rely on color alone to indicate selection

## Search

- Make search easy to find on discovery screens.
- Use a clear placeholder, for example: “Cari cafe, tempat, atau aktivitas…”
- Provide a visible search icon and accessible label.
- Keep filters separate from the search field when possible.

## Cards and surfaces

- Page background: warm cream or neutral 50
- Content surface: white
- Border: neutral 200
- Radius: 12–16px
- Use shadows sparingly; borders are often enough.

## Interaction states

Document and implement:
- Default
- Hover
- Focus-visible
- Active/pressed
- Disabled
- Loading
- Error (when applicable)

Always provide a visible keyboard focus state.
