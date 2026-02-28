export const metadata = {
  title: 'Explorateur de Charts Helm',
  description: "Lister et télécharger des charts depuis un dépôt Helm",
};

import './globals.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
