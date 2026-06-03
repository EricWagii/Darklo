/**
 * 用户管理界面组件
 * 
 * 功能：
 * - 创建新用户
 * - 切换用户
 * - 删除用户
 */

import React, { useState } from 'react';
import { useUser } from '@/contexts/UserContext';

export function UserManagement() {
  const { currentUser, allUsers, createUser, switchUser, deleteUser } = useUser();
  const [newUserName, setNewUserName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const handleCreateUser = () => {
    if (newUserName.trim()) {
      createUser(newUserName);
      setNewUserName('');
      setShowCreateForm(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', color: '#d4af37' }}>👤 用户管理</h3>

      {/* 当前用户 */}
      {currentUser && (
        <div
          style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #4ade80',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            当前用户
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 'bold',
              color: '#4ade80',
              marginBottom: '8px',
            }}
          >
            {currentUser.name}
          </div>
          <div style={{ fontSize: '11px', color: '#666' }}>
            创建于: {new Date(currentUser.createdAt).toLocaleDateString()}
            {currentUser.electrodeBaseline && (
              <>
                <br />
                ✓ 已采集电极基准
              </>
            )}
          </div>
        </div>
      )}

      {/* 用户列表 */}
      {allUsers.length > 1 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
            其他用户
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
            }}
          >
            {allUsers
              .filter((u) => u.id !== currentUser?.id)
              .map((user) => (
                <div
                  key={user.id}
                  style={{
                    backgroundColor: '#0a0a0a',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: '#aaa',
                    }}
                  >
                    {user.name}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => switchUser(user.id)}
                      style={{
                        flex: 1,
                        padding: '6px',
                        backgroundColor: '#d4af37',
                        color: '#000',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                      }}
                    >
                      切换
                    </button>
                    <button
                      onClick={() => deleteUser(user.id)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '11px',
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 创建新用户 */}
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#4ade80',
            color: '#000',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
          }}
        >
          + 创建新用户
        </button>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '8px',
          }}
        >
          <input
            type="text"
            placeholder="输入用户名"
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleCreateUser();
              }
            }}
            style={{
              flex: 1,
              padding: '8px',
              backgroundColor: '#0a0a0a',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#fff',
              fontSize: '13px',
            }}
          />
          <button
            onClick={handleCreateUser}
            style={{
              padding: '8px 16px',
              backgroundColor: '#4ade80',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
            }}
          >
            创建
          </button>
          <button
            onClick={() => {
              setShowCreateForm(false);
              setNewUserName('');
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: '#666',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            取消
          </button>
        </div>
      )}
    </div>
  );
}
