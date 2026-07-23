# Design — Flashcard

Hệ thống thiết kế khóa cho toàn bộ ứng dụng học flashcard. Mọi màn hình dùng chung màu sắc, typography, nhịp khoảng cách và ngôn ngữ tương tác này.

## Genre

Playful có tiết chế: thân thiện, ấm và dễ tiếp cận nhưng vẫn chính xác như một công cụ học tập chuyên nghiệp.

## Macrostructure family

- App pages: **Workbench** — điều hướng cố định, nội dung thiên về thao tác, thông tin đặt cạnh hành động tương ứng.
- Review page: **Study Stage** — một nhiệm vụ, một thẻ chính, tối thiểu nhiễu thị giác.
- Authentication: **Focused Entry** — form ngắn, lời dẫn rõ và một điểm nhận diện thương hiệu.

## Theme

- `--color-paper`: `oklch(97% 0.012 95)`
- `--color-paper-2`: `oklch(94% 0.016 95)`
- `--color-ink`: `oklch(20% 0.012 250)`
- `--color-ink-2`: `oklch(31% 0.018 250)`
- `--color-rule`: `oklch(84% 0.022 95)`
- `--color-rule-2`: `oklch(64% 0.026 95)`
- `--color-accent`: `oklch(86% 0.18 95)`
- `--color-focus`: `oklch(40% 0.16 255)`

Pear là màu của hành động chính. Cyan dùng cho liên kết và trạng thái thông tin. Coral chỉ xuất hiện ở lỗi hoặc một khoảnh khắc nhấn mạnh; không dùng gradient giữa các accent.

## Typography

- Display: Plus Jakarta Sans, weight 700, normal.
- Body: Plus Jakarta Sans, weight 400/500.
- Mono: JetBrains Mono, weight 500; chỉ dùng cho nhãn ngắn và dữ liệu kỹ thuật.
- Display tracking: `-0.03em`.
- Type scale: major-third, tối đa 5 cấp trên một màn hình.

## Spacing

Thang 4pt có tên trong `tokens.css`. CSS màn hình chỉ dùng token khoảng cách, không thêm giá trị tùy hứng cho layout chính.

## Motion

- Easings: `--ease-out`, `--ease-in`, `--ease-in-out`.
- Chỉ chuyển động `transform` và `opacity` cho hover/press; thanh tiến độ là chuyển động chức năng.
- Reduced motion: bỏ chuyển động không thiết yếu, thời lượng tối đa 150ms.

## Microinteractions stance

- Thành công hiển thị trực tiếp, không toast ăn mừng.
- Nút chính nhấc nhẹ khi hover và lún khi nhấn.
- Focus ring xuất hiện tức thì.
- Loading nằm trong đúng control đang xử lý.

## CTA voice

- Primary: nền pear, chữ ink, bo pill, nhãn bắt đầu bằng động từ cụ thể.
- Secondary: nền surface, viền hairline, không cạnh tranh với primary.
- Danger: nền coral rất nhạt, luôn đi kèm chữ mô tả hành động.

## Per-page allowances

- Dashboard dùng số liệu thật từ API; không tạo metric minh họa.
- Deck/Notes ưu tiên tìm kiếm, tạo và quản lý nội dung; không thêm trang trí.
- Review không có sidebar để người học tập trung vào một thẻ.
- Login được phép dùng một character mark CSS nhỏ của thương hiệu.

## What pages MUST share

- Wordmark Flashcard và dấu ba chấm học tập.
- Palette, typography, button, input, focus và trạng thái loading.
- Cạnh trái nội dung, page gutter và nhịp tiêu đề.
- Hit target tối thiểu 44px trên thiết bị cảm ứng.

## What pages MAY differ on

- Dashboard được phép bất đối xứng giữa khối “tiếp tục học” và số liệu.
- Trang nội dung dùng danh sách/card theo mật độ dữ liệu thực.
- Review dùng khung nội dung hẹp và nhịp dọc thoáng hơn app shell.

## Exports

`tokens.css` tại project root là nguồn chuẩn.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(97% 0.012 95);
  --color-paper-2: oklch(94% 0.016 95);
  --color-paper-3: oklch(91% 0.02 95);
  --color-ink: oklch(20% 0.012 250);
  --color-ink-2: oklch(31% 0.018 250);
  --color-rule: oklch(84% 0.022 95);
  --color-rule-2: oklch(64% 0.026 95);
  --color-accent: oklch(86% 0.18 95);
  --color-focus: oklch(40% 0.16 255);
  --font-display: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-body: 'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif;
  --font-outlier: 'JetBrains Mono', ui-monospace, monospace;
  --spacing-sm: 1rem;
  --spacing-md: 1.5rem;
  --spacing-lg: 2rem;
  --radius-card: 1.25rem;
  --radius-pill: 999px;
  --radius-input: 0.75rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(97% 0.012 95)", "$type": "color" },
    "paper-2": { "$value": "oklch(94% 0.016 95)", "$type": "color" },
    "rule-2": { "$value": "oklch(64% 0.026 95)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.012 250)", "$type": "color" },
    "accent": { "$value": "oklch(86% 0.18 95)", "$type": "color" },
    "focus": { "$value": "oklch(40% 0.16 255)", "$type": "color" }
  },
  "font": {
    "display": {
      "$value": "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif",
      "$type": "fontFamily"
    },
    "body": {
      "$value": "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif",
      "$type": "fontFamily"
    },
    "outlier": { "$value": "JetBrains Mono, ui-monospace, monospace", "$type": "fontFamily" }
  },
  "space": {
    "sm": { "$value": "1rem", "$type": "dimension" },
    "md": { "$value": "1.5rem", "$type": "dimension" },
    "lg": { "$value": "2rem", "$type": "dimension" }
  },
  "duration": {
    "micro": { "$value": "120ms", "$type": "duration" },
    "short": { "$value": "220ms", "$type": "duration" },
    "long": { "$value": "420ms", "$type": "duration" }
  }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97% 0.012 95;
  --foreground: 20% 0.012 250;
  --card: 99% 0.008 95;
  --card-foreground: 20% 0.012 250;
  --popover: 99% 0.008 95;
  --popover-foreground: 20% 0.012 250;
  --primary: 86% 0.18 95;
  --primary-foreground: 20% 0.012 250;
  --secondary: 91% 0.02 95;
  --secondary-foreground: 31% 0.018 250;
  --muted: 84% 0.022 95;
  --muted-foreground: 49% 0.016 250;
  --destructive: 44% 0.17 25;
  --destructive-foreground: 97% 0.012 95;
  --border: 84% 0.022 95;
  --input: 84% 0.022 95;
  --ring: 40% 0.16 255;
  --radius: 1.25rem;
}
```
