import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '', stack: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: String(error?.message || 'unknown_error')
    };
  }

  componentDidCatch(error) {
    this.setState({
      message: String(error?.message || 'unknown_error'),
      stack: String(error?.stack || '')
    });
    // Keep one diagnostic hook for native webview debugging.
    // eslint-disable-next-line no-console
    console.error('Root render failed:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'system-ui', color: '#1f2937' }}>
          <h2>Uygulama hatasi</h2>
          <p>Arayuz baslatilamadi. Lutfen tekrar acin.</p>
          <small>Detay: {this.state.message}</small>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
