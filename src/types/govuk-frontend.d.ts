/**
 * `govuk-frontend` 6 ships no TypeScript types — no `.d.ts` anywhere in `dist`,
 * and its package exports name only `.scss` and `.mjs`. Only the components with
 * real behaviour are declared here, and only the shape this app uses: construct
 * one over its root element and it wires itself up.
 *
 * Most of the design system needs none of this. The components are CSS classes
 * and correct markup, which is the point of it; these few have JavaScript because
 * they cannot be done without.
 */
declare module 'govuk-frontend' {
  interface GovukComponent {
    // eslint-disable-next-line @typescript-eslint/no-misused-new
    new (element: Element | null, config?: Record<string, unknown>): unknown;
  }
  export const Accordion: GovukComponent;
  export const Button: GovukComponent;
  export const CharacterCount: GovukComponent;
  export const Checkboxes: GovukComponent;
  export const ErrorSummary: GovukComponent;
  export const ExitThisPage: GovukComponent;
  export const FileUpload: GovukComponent;
  export const NotificationBanner: GovukComponent;
  export const PasswordInput: GovukComponent;
  export const Radios: GovukComponent;
  export const ServiceNavigation: GovukComponent;
  export const SkipLink: GovukComponent;
  export const Tabs: GovukComponent;
  export function initAll(config?: Record<string, unknown>): void;
}
