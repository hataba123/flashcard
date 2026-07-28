import { useState } from 'react';
import { Link } from 'react-router';

export interface WeaknessMetrics {
  reviewCount7d: number;
  againRate7d: number | null;
  reviewCount30d: number;
  againRate30d: number | null;
  medianAnswerSeconds30d: number | null;
  leechCount: number;
  averageStability: number | null;
  newCardCount: number;
  cardCount: number;
}

interface WeaknessGroup {
  type: 'deck' | 'tag';
  key: string;
  name: string;
  severity: 'high' | 'medium' | 'low';
  score: number;
  isDeteriorating: boolean;
  metrics: WeaknessMetrics;
  recommendations: string[];
}

export interface WeaknessAnalysisData {
  generatedAtUtc: string;
  overall: WeaknessMetrics | null;
  groups: WeaknessGroup[];
}

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);
const seconds = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} giây`;
const days = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('vi-VN')} ngày`;

function DiagnosticMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="diagnostic-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

export function WeaknessAnalysis({ data }: { data: WeaknessAnalysisData }) {
  const [groupType, setGroupType] = useState<'tag' | 'deck'>('tag');
  const actionableGroups = data.groups.filter((group) => group.type === groupType);
  const groups = actionableGroups.slice(0, 3);

  return (
    <section className="weakness-analysis" aria-labelledby="weakness-title">
      <header className="weakness-header">
        <div>
          <p className="eyebrow">Chẩn đoán 30 ngày</p>
          <h2 id="weakness-title">Điểm yếu cần xử lý</h2>
          <p>
            Ưu tiên dựa trên lượt quên, thẻ leech và xu hướng gần đây — không chỉ dựa vào số lượt
            học.
          </p>
        </div>
        <div className="diagnostic-tabs" role="group" aria-label="Nhóm phân tích">
          <button
            className={groupType === 'tag' ? 'is-active' : ''}
            type="button"
            aria-pressed={groupType === 'tag'}
            onClick={() => setGroupType('tag')}
          >
            Theo nhãn
          </button>
          <button
            className={groupType === 'deck' ? 'is-active' : ''}
            type="button"
            aria-pressed={groupType === 'deck'}
            onClick={() => setGroupType('deck')}
          >
            Theo bộ thẻ
          </button>
        </div>
      </header>

      {data.overall !== null && (
        <div className="diagnostic-baseline" aria-label="Mức trung bình của bạn">
          <span>Mức trung bình của bạn</span>
          <strong>Again 7 ngày {percent(data.overall.againRate7d)}</strong>
          <strong>Again 30 ngày {percent(data.overall.againRate30d)}</strong>
          <strong>Trả lời {seconds(data.overall.medianAnswerSeconds30d)}</strong>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="diagnostic-clear">
          <span aria-hidden="true">✓</span>
          <div>
            <h3>Chưa có điểm yếu nổi bật</h3>
            <p>
              Cần ít nhất 10 lượt ôn trong 30 ngày để so sánh tỷ lệ Again. Tiếp tục học để nhận
              khuyến nghị chính xác hơn.
            </p>
          </div>
        </div>
      ) : (
        <div className="diagnostic-list">
          {groups.map((group) => (
            <article
              className="diagnostic-item"
              data-severity={group.severity}
              key={`${group.type}:${group.key}`}
            >
              <header>
                <div>
                  <span className="diagnostic-kind">
                    {group.type === 'tag' ? 'Nhãn' : 'Bộ thẻ'}
                  </span>
                  <h3>{group.name}</h3>
                </div>
                <span className="diagnostic-status">
                  {group.isDeteriorating ? 'Đang xấu đi' : 'Cần chú ý'}
                </span>
              </header>

              <div className="diagnostic-metrics">
                <DiagnosticMetric
                  label="Again · 7 ngày"
                  value={percent(group.metrics.againRate7d)}
                  detail={`${group.metrics.reviewCount7d} lượt ôn`}
                />
                <DiagnosticMetric
                  label="Again · 30 ngày"
                  value={percent(group.metrics.againRate30d)}
                  detail={`${group.metrics.reviewCount30d} lượt ôn`}
                />
                <DiagnosticMetric
                  label="Trả lời trung vị"
                  value={seconds(group.metrics.medianAnswerSeconds30d)}
                  detail="30 ngày gần nhất"
                />
                <DiagnosticMetric
                  label="Thẻ leech"
                  value={String(group.metrics.leechCount)}
                  detail="Nên viết lại"
                />
                <DiagnosticMetric
                  label="Độ ổn định"
                  value={days(group.metrics.averageStability)}
                  detail="Trung bình thẻ đã học"
                />
                <DiagnosticMetric
                  label="Thẻ mới"
                  value={`${group.metrics.newCardCount}/${group.metrics.cardCount}`}
                  detail="Trong nhóm này"
                />
              </div>

              <div className="diagnostic-advice">
                <span aria-hidden="true">→</span>
                <div>
                  <strong>Việc nên làm tiếp theo</strong>
                  {group.recommendations.map((recommendation) => (
                    <p key={recommendation}>{recommendation}</p>
                  ))}
                </div>
              </div>
              <Link className="diagnostic-link" to="/notes">
                Mở danh sách thẻ <span aria-hidden="true">↗</span>
              </Link>
            </article>
          ))}
          {actionableGroups.length > groups.length && (
            <p className="diagnostic-limit">
              Hiển thị {groups.length} ưu tiên cần xử lý trước trong {actionableGroups.length} nhóm.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
