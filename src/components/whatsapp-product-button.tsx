export function WhatsAppProductButton({
  href,
  disabled,
}: {
  href: string | null;
  disabled?: boolean;
}) {
  if (!href || disabled) {
    return (
      <span className="text-xs text-[var(--muted)]">
        WhatsApp produit (numéro boutique non configuré)
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-[var(--brand)] underline"
    >
      Demander via WhatsApp
    </a>
  );
}
