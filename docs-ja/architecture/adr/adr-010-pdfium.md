# ADR-010：PDFビューアはPDFiumをそのまま使用

**ステータス**：決定済み

## 決定

Chromium内蔵のPDFiumをそのまま利用し、独自PDFビューアは開発しない。

## 理由

API仕様書・論文閲覧の需要はあるが、Chromiumを再利用する既存パターン（[ADR-004](./adr-004-chromium-fixed.md) 等）の直接適用。
