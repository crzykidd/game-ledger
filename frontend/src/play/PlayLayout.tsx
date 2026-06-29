import React from 'react';
import { Outlet } from 'react-router-dom';
import { AppShell } from '../components/AppShell';

export function PlayLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
