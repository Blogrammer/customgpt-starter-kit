'use client'

import {
  RocketOutlineIcon,
  BuildingIcon,
  PaletteIcon,
  CodeIcon,
  BookIcon,
  HospitalIcon
} from './icons'

const useCases = [
  {
    icon: RocketOutlineIcon,
    title: 'SaaS Products',
    subtitle: 'White-label CustomGPT.ai for your customers',
    features: [
      'Custom branding & themes',
      'Embedded widgets',
      'Usage analytics & reporting',
      'Multi-tenant architecture',
      'API rate limiting',
      'White-label deployment'
    ],
    gradient: 'from-customgpt-primary to-customgpt-secondary'
  },
  {
    icon: BuildingIcon,
    title: 'Internal Tools',
    subtitle: 'Deploy RAG for your team',
    features: [
      'Deploy the Interface on your Cloud while we store the data securely with us',
      'Rate Limiting & quotas',
      'Rate Limit IP and Conversation Query limits',
      'Admin panel for real-time config & monitoring',
      'Cloudflare Turnstile bot protection'

    ],
    gradient: 'from-customgpt-secondary to-customgpt-dark-blue'
  },
  {
    icon: PaletteIcon,
    title: 'Agencies',
    subtitle: 'Ship client projects faster',
    features: [
      'Multi-tenant support',
      'Custom themes & branding',
      'Quick deployment options',
      'Client management dashboard',
      'Billing integration',
      'Performance monitoring'
    ],
    gradient: 'from-customgpt-dark-blue to-customgpt-midtone'
  },
  {
    icon: CodeIcon,
    title: 'Developers',
    subtitle: 'Build on top of CustomGPT.ai',
    features: [
      'Full API access',
      'TypeScript support',
      'Extensible architecture',
      'Component library',
      'Development tools',
      'Open source community'
    ],
    gradient: 'from-customgpt-midtone to-customgpt-accent'
  },
  {
    icon: BookIcon,
    title: 'Education',
    subtitle: 'Learning and training platforms',
    features: [
      'Student progress tracking',
      'Curriculum integration',
      'Multi-language support',
      'Accessibility features',
      'Parent/teacher dashboards',
      'Assessment tools'
    ],
    gradient: 'from-customgpt-accent to-customgpt-primary'
  },
  {
    icon: HospitalIcon,
    title: 'Healthcare',
    subtitle: 'SOC2 and GDPR-compliant AI assistance',
    features: [
      'Secure data handling',
      'Medical terminology support',
      'Integration with EMRs',
      'Audit trail logging',
      'Privacy-first architecture'
    ],
    gradient: 'from-customgpt-primary to-customgpt-dark-blue'
  }
]

export function UseCasesSection() {
  return (
    <section className="py-20 bg-landing-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-landing-text mb-4">
            Who&apos;s Using This?
          </h2>
          <p className="text-lg sm:text-xl text-landing-text-secondary max-w-3xl mx-auto">
            From startups to enterprises, developers across industries are building with CustomGPT.ai Starter Kit
          </p>
        </div>

        {/* Scrolling Cards Container */}
        <div className="relative">
          {/* Gradient Overlays for scroll indication */}
          <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-landing-surface to-transparent z-10 pointer-events-none"></div>
          <div className="hidden lg:block absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-landing-surface to-transparent z-10 pointer-events-none"></div>

          {/* Cards Scroll Container */}
          <div className="overflow-x-auto pb-6 scrollbar-hide">
            <div className="flex gap-6 lg:gap-8" style={{ width: 'max-content' }}>
              {useCases.map((useCase, index) => (
                <div
                  key={index}
                  className="group relative w-80 sm:w-96 bg-white rounded-2xl overflow-hidden border border-landing-surface-light hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                >
                  {/* Gradient Header */}
                  <div className={`h-32 bg-gradient-to-r ${useCase.gradient} relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-black/10"></div>
                    <div className="relative z-10 flex items-center justify-between p-6 h-full">
                      <div className="text-6xl opacity-80">
                        <useCase.icon size={60} className="text-white" />
                      </div>
                      <div className="w-20 h-20 bg-white/20 rounded-full blur-xl"></div>
                    </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-6">
                    <h3 className="text-2xl font-bold text-landing-text mb-2 group-hover:text-customgpt-primary transition-colors">
                      {useCase.title}
                    </h3>
                    <p className="text-landing-text-secondary mb-6 font-medium">
                      {useCase.subtitle}
                    </p>

                    {/* Features List */}
                    <div className="space-y-3">
                      {useCase.features.map((feature, featureIndex) => (
                        <div
                          key={featureIndex}
                          className="flex items-center gap-3 text-landing-text-secondary"
                        >
                          <div className="w-2 h-2 bg-customgpt-primary rounded-full flex-shrink-0"></div>
                          <span className="text-sm">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Stats */}
        <div className="mt-16 text-center">
          <div className="bg-white rounded-2xl p-8 border border-landing-surface-light">
            <h3 className="text-2xl font-bold text-landing-text mb-6">
              Trusted by Growing Companies
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-customgpt-primary mb-1">1000+</div>
                <div className="text-landing-text-secondary text-sm">Active Deployments</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-customgpt-secondary mb-1">50+</div>
                <div className="text-landing-text-secondary text-sm">Enterprise Clients</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-customgpt-dark-blue mb-1">99.9%</div>
                <div className="text-landing-text-secondary text-sm">Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-customgpt-midtone mb-1">24/7</div>
                <div className="text-landing-text-secondary text-sm">Support</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </section>
  )
}