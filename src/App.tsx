import { useCallback, useEffect, useState } from 'react'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { Tabs } from 'decentraland-ui/dist/components/Tabs/Tabs'
import { CouncilStipends } from './components/CouncilStipends'
import { DateRangePicker } from './components/DateRangePicker'
import { CuratorFeesCalculator } from './components/CuratorFeesCalculator'
import { CuratorFeesReport } from './components/CuratorFeesReport'
import { SafeConnectionStatus } from './SafeConnectionStatus'
import { DateRange, CuratorFeesSummary, RangeType } from './types'
import { useSafeConnection } from './useSafeConnection'
import './App.css'

type AppTab = 'curators' | 'council';

type AppRouteState = {
  activeTab: AppTab;
  dateRange: DateRange;
  rangeType: RangeType;
};

const APP_ROUTES: Record<AppTab, string> = {
  curators: '/curators',
  council: '/council',
};

function App() {
  const [initialRouteState] = useState(readRouteState);
  const [activeTab, setActiveTab] = useState<AppTab>(
    initialRouteState.activeTab
  );
  const safeConnection = useSafeConnection();
  const [dateRange, setDateRange] = useState<DateRange>(
    initialRouteState.dateRange
  );
  const [rangeType, setRangeType] = useState<RangeType>(
    initialRouteState.rangeType
  );
  const [curatorFees, setCuratorFees] = useState<CuratorFeesSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    replaceRouteState(initialRouteState.activeTab, initialRouteState.dateRange);

    const handlePopState = () => {
      const nextRouteState = readRouteState();
      setActiveTab(nextRouteState.activeTab);

      if (nextRouteState.activeTab === 'curators') {
        setDateRange(nextRouteState.dateRange);
        setRangeType(nextRouteState.rangeType);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [initialRouteState]);

  const handleDateRangeChange = useCallback((newDateRange: DateRange) => {
    setDateRange(newDateRange);
    replaceRouteState('curators', newDateRange);
  }, []);

  const handleRangeTypeChange = useCallback((newRangeType: RangeType) => {
    setRangeType(newRangeType);
  }, []);

  const handleTabChange = useCallback(
    (nextTab: AppTab) => {
      if (nextTab === activeTab) {
        return;
      }

      setActiveTab(nextTab);
      pushRouteState(nextTab, dateRange);
    },
    [activeTab, dateRange]
  );

  const handleFeesCalculated = useCallback((fees: CuratorFeesSummary[]) => {
    setCuratorFees(fees);
  }, []);

  const handleLoadingChange = useCallback((loading: boolean) => {
    setIsLoading(loading);
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-content">
          <h1 className="app-title">DCL DAO Council</h1>
          <SafeConnectionStatus {...safeConnection} />
        </div>
        <nav className="app-navigation" aria-label="DCL DAO Council sections">
          <Tabs className="app-tabs">
            <Tabs.Tab
              active={activeTab === 'curators'}
              onClick={() => handleTabChange('curators')}
            >
              Curators
            </Tabs.Tab>
            <Tabs.Tab
              active={activeTab === 'council'}
              onClick={() => handleTabChange('council')}
            >
              Council
            </Tabs.Tab>
          </Tabs>
        </nav>
      </header>

      <main className="app">
        {activeTab === 'curators' ? (
          <>
            <DateRangePicker
              dateRange={dateRange}
              onDateRangeChange={handleDateRangeChange}
              rangeType={rangeType}
              onRangeTypeChange={handleRangeTypeChange}
            />
            
            <CuratorFeesCalculator
              dateRange={dateRange}
              onFeesCalculated={handleFeesCalculated}
              onLoadingChange={handleLoadingChange}
            />
            
            <CuratorFeesReport
              fees={curatorFees}
              dateRange={dateRange}
              isLoading={isLoading}
              {...safeConnection}
            />
          </>
        ) : (
          <CouncilStipends {...safeConnection} />
        )}
      </main>
    </div>
  )
}

function readRouteState(): AppRouteState {
  const activeTab = getTabFromPath(window.location.pathname);
  const dateRange = getDateRangeFromSearch(window.location.search);

  return {
    activeTab,
    dateRange,
    rangeType: inferRangeType(dateRange),
  };
}

function getTabFromPath(pathname: string): AppTab {
  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  return normalizedPathname === APP_ROUTES.council ? 'council' : 'curators';
}

function getDefaultDateRange(): DateRange {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // If current month is not over, use today as end date.
  const toDate = now < monthEnd ? now : monthEnd;

  return {
    from: monthStart,
    to: toDate,
  };
}

function getDateRangeFromSearch(search: string): DateRange {
  const defaultDateRange = getDefaultDateRange();
  const params = new URLSearchParams(search);
  const from = parseDateParam(params.get('from'), 'start');
  const to = parseDateParam(params.get('to'), 'end');

  if (!from || !to || from.getTime() > to.getTime()) {
    return defaultDateRange;
  }

  return { from, to };
}

function parseDateParam(
  value: string | null,
  boundary: 'start' | 'end'
): Date | null {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }

    if (boundary === 'end') {
      date.setHours(23, 59, 59, 999);
    }

    return date;
  }

  if (/^\d+$/.test(value)) {
    const timestamp = Number(value);
    const date = new Date(timestamp * 1000);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function inferRangeType(dateRange: DateRange): RangeType {
  const monthStart = startOfMonth(dateRange.from);
  const monthEnd = endOfMonth(dateRange.from);
  const now = new Date();
  const isCurrentMonth =
    dateRange.from.getFullYear() === now.getFullYear() &&
    dateRange.from.getMonth() === now.getMonth();
  const expectedToDate = isCurrentMonth && now < monthEnd ? now : monthEnd;

  return formatDateParam(dateRange.from) === formatDateParam(monthStart) &&
    formatDateParam(dateRange.to) === formatDateParam(expectedToDate)
    ? 'month'
    : 'custom';
}

function pushRouteState(activeTab: AppTab, dateRange: DateRange) {
  window.history.pushState(null, '', getRouteUrl(activeTab, dateRange));
}

function replaceRouteState(activeTab: AppTab, dateRange: DateRange) {
  window.history.replaceState(null, '', getRouteUrl(activeTab, dateRange));
}

function getRouteUrl(activeTab: AppTab, dateRange: DateRange) {
  const url = new URL(window.location.href);
  url.pathname = APP_ROUTES[activeTab];
  url.hash = '';

  if (activeTab === 'curators') {
    url.searchParams.set('from', formatDateParam(dateRange.from));
    url.searchParams.set('to', formatDateParam(dateRange.to));
  } else {
    url.search = '';
  }

  return `${url.pathname}${url.search}`;
}

function formatDateParam(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

export default App
