import type { Element, ElementContent, Root, RootContent } from 'hast';

/**
 * Ba việc dưới đây được làm LÚC BUILD chứ không phải lúc chạy trên trình duyệt.
 * Nhờ vậy HTML gửi xuống đã đúng hình dạng cuối cùng: không có layout shift,
 * không cần JS để dựng DOM, và trang vẫn đầy đủ khi JS bị chặn.
 *
 *  1. Thêm neo `#` cạnh mỗi heading (Astro đã tự sinh sẵn `id`).
 *  2. Bọc mỗi `<pre>` trong khung có nút copy.
 *  3. Bọc mỗi `<table>` trong khung cuộn ngang, để trang không bao giờ cuộn ngang.
 *  4. Gắn `scope="col"` cho ô tiêu đề bảng, để screen reader đọc đúng cột.
 */

const HEADINGS = new Set(['h2', 'h3', 'h4']);

function isElement(node: RootContent | ElementContent): node is Element {
  return node.type === 'element';
}

function headingAnchor(id: string, text: string): Element {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['heading-anchor'],
      href: `#${id}`,
      'aria-label': `Liên kết trực tiếp tới mục "${text}"`,
    },
    children: [{ type: 'text', value: '#' }],
  };
}

function textOf(node: Element): string {
  return node.children
    .map((child) => {
      if (child.type === 'text') return child.value;
      if (child.type === 'element') return textOf(child);
      return '';
    })
    .join('');
}

function copyButton(): Element {
  return {
    type: 'element',
    tagName: 'button',
    properties: {
      type: 'button',
      className: ['code-block__copy'],
      'aria-label': 'Sao chép đoạn mã',
      'data-copy-code': '',
    },
    children: [
      {
        type: 'element',
        tagName: 'svg',
        properties: {
          xmlns: 'http://www.w3.org/2000/svg',
          width: 16,
          height: 16,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        children: [
          {
            type: 'element',
            tagName: 'rect',
            properties: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' },
            children: [],
          },
          {
            type: 'element',
            tagName: 'path',
            properties: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' },
            children: [],
          },
        ],
      },
    ],
  };
}

/**
 * Markdown sinh ra `<th>` trần, không có `scope`. Với bảng một hàng tiêu đề thì
 * trình duyệt đoán được, nhưng screen reader chỉ đọc chắc chắn đúng cột khi có
 * `scope="col"` — và đó cũng là thứ axe kiểm.
 */
function addColumnScopes(table: Element): void {
  const visit = (node: Element): void => {
    for (const child of node.children) {
      if (child.type !== 'element') continue;
      if (child.tagName === 'th') {
        child.properties = { ...child.properties, scope: 'col' };
      } else {
        visit(child);
      }
    }
  };

  visit(table);
}

function wrap(child: Element, className: string, extra: Element[] = []): Element {
  return {
    type: 'element',
    tagName: 'div',
    properties: { className: [className] },
    children: [child, ...extra],
  };
}

export function rehypeContent() {
  return (tree: Root): void => {
    const walk = (parent: Root | Element): void => {
      for (let i = 0; i < parent.children.length; i += 1) {
        const node = parent.children[i];
        if (!node || !isElement(node)) continue;

        const id = typeof node.properties?.['id'] === 'string' ? node.properties['id'] : '';

        if (HEADINGS.has(node.tagName) && id) {
          node.children.push(headingAnchor(id, textOf(node)));
        } else if (node.tagName === 'pre') {
          parent.children[i] = wrap(node, 'code-block', [copyButton()]);
          continue; // Đã bọc xong, không cần đi sâu vào bên trong <pre>.
        } else if (node.tagName === 'table') {
          addColumnScopes(node);
          parent.children[i] = wrap(node, 'table-scroll');
          continue;
        }

        walk(node);
      }
    };

    walk(tree);
  };
}
