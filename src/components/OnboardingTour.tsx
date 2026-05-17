import React, { useState, useEffect } from 'react';
import { Joyride, STATUS } from 'react-joyride';
import type { Step } from 'react-joyride';
import { useLpo } from '../context/LpoContext';

const OnboardingTour: React.FC = () => {
  const { hasCompletedTour, completeTour, user } = useLpo();
  const [run, setRun] = useState(false);

  useEffect(() => {
    // Only run the tour if the user is logged in and hasn't completed it yet
    if (user && !hasCompletedTour) {
      // Delay slightly to ensure elements are rendered
      const timer = setTimeout(() => {
        setRun(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, hasCompletedTour]);

  const steps: Step[] = [
    {
      target: 'body',
      placement: 'center',
      title: 'Welcome to LocalMile.Plus!',
      content: "Let's take a quick tour of your new logistics command center. We've designed this to help you manage your jobs with ease and precision.",
    },
    {
      target: '#tour-sidebar',
      title: 'Navigation Sidebar',
      content: 'Access all your essential tools here. Navigate between your Dashboard, Customer Hub, Recurring Schedules, and more.',
      placement: 'right',
    },
    {
      target: '#tour-new-job',
      title: 'Book a New Job',
      content: 'Ready to dispatch? Click here to quickly create a one-off or recurring job for any of your customers.',
      placement: 'bottom',
    },
    {
      target: '#tour-tabs',
      title: 'Workflow Management',
      content: 'Switch between views to manage active jobs today, review pending requests, or check your service history.',
      placement: 'right',
    },
    {
      target: '#tour-filters',
      title: 'Search & Filters',
      content: 'Quickly find what you need by searching for company names or filtering by specific dates and service types.',
      placement: 'bottom',
    },
    {
      target: '#tour-help',
      title: 'Support Center',
      content: "Have a question or need assistance? Our support center is always here to help you get the most out of localmile.plus.",
      placement: 'right',
    },
  ];

  const handleJoyrideCallback = (data: any) => {
    const { status } = data;
    const finishedStatuses: string[] = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      completeTour();
    }
  };

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        onEvent={handleJoyrideCallback}
        options={{
          showProgress: true,
          buttons: ['back', 'primary', 'skip'],
        }}
        styles={{
          overlay: {
            backgroundColor: 'rgba(9, 92, 123, 0.4)',
          },
          arrow: {
            color: '#FFFFFF',
          },
          tooltip: {
            backgroundColor: '#FFFFFF',
            borderRadius: '20px',
            padding: '24px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            border: '1px solid rgba(168, 118, 58, 0.1)',
          },
          tooltipTitle: {
            fontFamily: 'Fraunces, serif',
            fontSize: '1.4rem',
            fontWeight: 400,
            marginBottom: '12px',
            color: '#1A3D33', // --ink
          },
          tooltipContent: {
            fontFamily: 'Manrope, sans-serif',
            fontSize: '1rem',
            lineHeight: 1.6,
            color: '#2A4E43', // --ink-soft
          },
          buttonPrimary: {
            backgroundColor: '#1A3D33', // --ink
            borderRadius: '12px',
            padding: '12px 24px',
            fontSize: '0.9rem',
            fontWeight: 700,
            transition: 'all 0.2s ease',
            color: '#FFFFFF',
          },
          buttonBack: {
            color: '#A8763A', // --gold
            marginRight: '12px',
            fontWeight: 700,
          },
          buttonSkip: {
            color: '#2A4E43', // --ink-soft
            opacity: 0.6,
            fontSize: '0.85rem',
            fontWeight: 600,
          },
        }}
      />
      <style>{`
        .joyride-tooltip__close {
          display: none !important;
        }
        
        @media (max-width: 1024px) {
          /* Adjustments for mobile if needed */
          #react-joyride-step-0 .joyride-tooltip {
            width: 90% !important;
            max-width: 400px !important;
          }
        }
      `}</style>
    </>
  );
};

export default OnboardingTour;
