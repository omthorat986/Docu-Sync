import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

function AnalyticsModal({ activityLogs, onClose }) {
  const userStats = useMemo(() => {
    const stats = {};

    activityLogs.forEach(log => {
      if (!stats[log.userName]) {
        stats[log.userName] = {
          name: log.userName,
          color: log.userColor || '#4F46E5',
          edits: 0,
          snapshots: 0,
          joins: 0
        };
      }
      
      if (log.type === 'edit') stats[log.userName].edits += 1;
      if (log.type === 'snapshot') stats[log.userName].snapshots += 1;
      if (log.type === 'join') stats[log.userName].joins += 1;
    });

    return Object.values(stats).sort((a, b) => b.edits - a.edits);
  }, [activityLogs]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 'min(700px, 100%)' }}>
        <div className="modal-head">
          <div>
            <h3>Contributor Analytics</h3>
            <p>See who leads the collaboration effort</p>
          </div>
          <button className="secondary-btn" onClick={onClose}>Close</button>
        </div>

        <div style={{ marginTop: '24px' }}>
          <h4>Total Edits by User</h4>
          <div style={{ height: '300px', width: '100%', marginTop: '16px', background: '#f8fafc', borderRadius: '12px', padding: '20px 20px 0 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={userStats} margin={{ left: -20, bottom: 20 }}>
                <XAxis dataKey="name" tick={{ fontSize: 13 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 13 }} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#e2e8f0', opacity: 0.4 }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="edits" radius={[4, 4, 0, 0]}>
                  {userStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ marginTop: '24px' }}>
          <h4>Activity Breakdown</h4>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginTop: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '8px' }}>User</th>
                <th style={{ padding: '8px' }}>Edits</th>
                <th style={{ padding: '8px' }}>Snapshots Saved</th>
                <th style={{ padding: '8px' }}>Sessions (Joins)</th>
              </tr>
            </thead>
            <tbody>
              {userStats.length === 0 && (
                <tr><td colSpan="4" style={{ padding: '8px', color: '#64748b' }}>No activity data yet.</td></tr>
              )}
              {userStats.map(stat => (
                <tr key={stat.name} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 8px', fontWeight: 'bold', color: stat.color }}>{stat.name}</td>
                  <td style={{ padding: '12px 8px' }}>{stat.edits}</td>
                  <td style={{ padding: '12px 8px' }}>{stat.snapshots}</td>
                  <td style={{ padding: '12px 8px' }}>{stat.joins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsModal;
