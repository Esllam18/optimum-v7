'use client';

import React from 'react';
import { telemetry } from '../lib/telemetry';
import { ErrorState } from './Primitives';

export default class V7ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { telemetry.capture('react_render_error', error, { componentStack: info?.componentStack || '' }, 'error'); }
  render() {
    if (!this.state.error) return this.props.children;
    const ar = this.props.locale === 'ar';
    return <div className="v7-boundary"><ErrorState title={ar ? 'حدث خطأ في هذه الشاشة' : 'This screen encountered an error'} description={ar ? 'تم تسجيل الخطأ تشخيصيًا. يمكنك إعادة تحميل الشاشة بدون فقد جلسة الدخول.' : 'The error was captured for diagnostics. You can reload this screen without losing your sign-in session.'} retryLabel={ar ? 'إعادة تحميل الشاشة' : 'Reload screen'} onRetry={() => this.setState({ error: null }, () => location.reload())} /></div>;
  }
}
