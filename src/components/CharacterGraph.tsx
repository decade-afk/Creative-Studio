/**
 * 文件名：CharacterGraph.tsx
 * 模块名称：角色关系图谱（SVG）
 *
 * 【核心功能】
 * 将角色的 relationships 文本解析为连线：若 A 的关系描述中出现 B 的名字
 * （或反之），则绘制 A-B 边；节点为角色头像与名字。
 *
 * 【布局】
 * 环形布局（按角色数均分圆周），无需引入力导向库即可得到清晰可读的图。
 * 节点支持拖拽微调位置；点击节点可触发编辑回调。
 */

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import type { Character } from '../types/storage';

interface CharacterGraphProps {
  characters: Character[];
  onEdit?: (character: Character) => void;
}

/** 图谱画布尺寸 */
const SIZE = 560;
const CENTER = SIZE / 2;
const RADIUS = SIZE / 2 - 90;

/** 解析关系边：宽松匹配——A 提及 B 的名字，或提及 B 名字中长度≥2 的片段
 *  （如"站长老周"与"老周"视为同一人），取提及方的关系描述为标签 */
function buildEdges(characters: Character[]): { a: number; b: number; label: string }[] {
  const edges: { a: number; b: number; label: string }[] = [];

  /** text 是否提及 name（完整名，或名字里≥2字的连续片段） */
  const mentions = (text: string, name: string): boolean => {
    if (!text || !name) return false;
    if (text.includes(name)) return true;
    // 生成名字的所有连续子串（长度>=2），任一命中即视为提及
    for (let len = name.length - 1; len >= 2; len--) {
      for (let start = 0; start + len <= name.length; start++) {
        if (text.includes(name.slice(start, start + len))) return true;
      }
    }
    return false;
  };

  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      const a = characters[i];
      const b = characters[j];
      const aMentionsB = mentions(a.relationships || '', b.name);
      const bMentionsA = mentions(b.relationships || '', a.name);
      if (aMentionsB || bMentionsA) {
        const label = aMentionsB ? a.relationships || '' : b.relationships || '';
        edges.push({ a: i, b: j, label: label.slice(0, 20) });
      }
    }
  }
  return edges;
}

export default function CharacterGraph({ characters, onEdit }: CharacterGraphProps) {
  // 拖拽偏移（角色 id → {dx, dy}）
  const [offsets, setOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  const dragRef = useRef<{ id: string; startX: number; startY: number; baseDx: number; baseDy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /** 环形初始坐标 + 用户偏移 */
  const positions = useMemo(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    characters.forEach((c, i) => {
      const angle = (2 * Math.PI * i) / characters.length - Math.PI / 2;
      const off = offsets[c.id] || { dx: 0, dy: 0 };
      pos[c.id] = {
        x: CENTER + RADIUS * Math.cos(angle) + off.dx,
        y: CENTER + RADIUS * Math.sin(angle) + off.dy,
      };
    });
    return pos;
  }, [characters, offsets]);

  const edges = useMemo(() => buildEdges(characters), [characters]);

  /** 开始拖拽节点 */
  const handleNodeMouseDown = useCallback((e: React.MouseEvent, character: Character) => {
    e.preventDefault();
    const off = offsets[character.id] || { dx: 0, dy: 0 };
    dragRef.current = { id: character.id, startX: e.clientX, startY: e.clientY, baseDx: off.dx, baseDy: off.dy };
  }, [offsets]);

  /** 拖拽移动 */
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setOffsets((prev) => ({
        ...prev,
        [drag.id]: {
          dx: drag.baseDx + (e.clientX - drag.startX),
          dy: drag.baseDy + (e.clientY - drag.startY),
        },
      }));
    };
    const handleUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  if (characters.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-secondary">
        <div className="text-4xl mb-4">🕸️</div>
        <p>暂无角色，先生成或创建角色后再查看图谱</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="max-w-full bg-surface-secondary rounded-xl border border-outline"
        style={{ touchAction: 'none' }}
      >
        {/* 关系边 */}
        {edges.map((edge, idx) => {
          const pa = positions[characters[edge.a].id];
          const pb = positions[characters[edge.b].id];
          if (!pa || !pb) return null;
          const mx = (pa.x + pb.x) / 2;
          const my = (pa.y + pb.y) / 2;
          return (
            <g key={idx}>
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke="#a07d5e" strokeWidth={1.5} opacity={0.55} />
              {edge.label && (
                <text x={mx} y={my - 4} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.7}>
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}

        {/* 无任何边时的提示 */}
        {edges.length === 0 && (
          <text x={CENTER} y={SIZE - 16} textAnchor="middle" fontSize={12} fill="currentColor" opacity={0.5}>
            未检测到角色关系：在角色的"关系"字段中提到其他角色名字即可建立连线
          </text>
        )}

        {/* 角色节点 */}
        {characters.map((c) => {
          const p = positions[c.id];
          return (
            <g
              key={c.id}
              transform={`translate(${p.x}, ${p.y})`}
              className="cursor-pointer"
              onMouseDown={(e) => handleNodeMouseDown(e, c)}
              onDoubleClick={() => onEdit?.(c)}
            >
              <circle r={30} fill="#8b6342" opacity={0.15} />
              <circle r={26} fill="#a07d5e" />
              <text textAnchor="middle" y={7} fontSize={22}>
                {c.avatar || '👤'}
              </text>
              <text textAnchor="middle" y={48} fontSize={13} fill="currentColor" fontWeight={500}>
                {c.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-on-surface-secondary">
        拖动节点调整布局 · 双击节点编辑角色 · 连线由"关系"字段中相互提及自动生成
      </p>
    </div>
  );
}
