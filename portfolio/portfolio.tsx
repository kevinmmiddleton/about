import React, { useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, Linkedin, Calendar, GraduationCap, Award, BookOpen, Rocket, Brain, GitBranch, Users, ChevronDown, Quote, X } from 'lucide-react'

// Custom color classes
const sectionColors = [
  'from-[#00a8ff] to-[#205aff]',
  'from-[#205aff] to-[#4021ff]',
  'from-[#4021ff] to-[#5e00ff]',
  'from-[#5e00ff] to-[#7c00ff]',
  'from-[#7c00ff] to-[#a300ff]',
  'from-[#a300ff] to-[#c800f5]',
  'from-[#c800f5] to-[#e600de]',
  'from-[#e600de] to-[#f705b2]',
  'from-[#f705b2] to-[#ff1c7f]',
  'from-[#ff1c7f] to-[#ff3c49]',
  'from-[#ff3c49] to-[#ff5521]',
  'from-[#ff5521] to-[#ff710a]',
  'from-[#ff710a] to-[#ff9500]',
  'from-[#ff9500] to-[#00a8ff]',
]

// Header Component
const Header = () => (
  <header className="fixed top-0 left-0 right-0 bg-white bg-opacity-90 shadow-md z-50">
    <nav className="container mx-auto px-6 py-3">
      <ul className="flex justify-center space-x-6">
        <li><a href="#hero" className="text-primary hover:text-primary-dark">Home</a></li>
        <li><a href="#about" className="text-primary hover:text-primary-dark">About</a></li>
        <li><a href="#experience" className="text-primary hover:text-primary-dark">Experience</a></li>
        <li><a href="#projects" className="text-primary hover:text-primary-dark">Projects</a></li>
        <li><a href="#skills" className="text-primary hover:text-primary-dark">Skills</a></li>
        <li><a href="#connect" className="text-primary hover:text-primary-dark">Connect</a></li>
      </ul>
    </nav>
  </header>
)

// Hero Section Component
const HeroSection = () => (
  <section id="hero" className={`min-h-screen flex items-center justify-center relative bg-gradient-to-b ${sectionColors[0]}`}>
    <div className="text-center z-10">
      <motion.h1 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-4xl md:text-6xl font-bold mb-4 text-white"
      >
        Kevin Middleton
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="text-xl md:text-2xl mb-8 text-white"
      >
        Full Stack Product Manager
      </motion.p>
      <motion.a
        href="#about"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-white text-primary px-6 py-3 rounded-full hover:bg-gray-200 transition-colors"
      >
        Learn More
      </motion.a>
    </div>
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.6 }}
      className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
    >
      <ChevronDown className="w-8 h-8 text-white animate-bounce" />
    </motion.div>
  </section>
)

// About Me Component
const AboutMe = () => (
  <section id="about" className={`py-20 bg-gradient-to-b ${sectionColors[1]}`}>
    <div className="container mx-auto px-4">
      <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">About Me</h2>
      <div className="flex flex-col md:flex-row items-center justify-between">
        <div className="md:w-1/2 mb-8 md:mb-0">
          <Image
            src="/placeholder.svg?height=400&width=400"
            alt="Kevin Middleton"
            width={400}
            height={400}
            className="rounded-full"
          />
        </div>
        <div className="md:w-1/2">
          <p className="text-lg mb-4 text-white">
            I'm a seasoned Product Manager with over 11 years of experience in SaaS, spanning both enterprise and consumer products. My passion lies in bringing ideas to life through cross-functional collaboration and data-driven solutions.
          </p>
          <p className="text-lg mb-4 text-white">
            With expertise in product strategy, agile methodologies, and customer-focused design, I've led transformative projects across industries such as social media, legal tech, marketing tech, and HVAC. I specialize in creating tools that drive customer engagement and conversions, such as lead generation tools, calculators, and integrations.
          </p>
          <p className="text-lg text-white">
            When I'm not working on product innovations, you can find me enjoying pop culture, playing casual video games, or experimenting with new recipes—especially spicy and savory dishes.
          </p>
        </div>
      </div>
    </div>
  </section>
)

// Professional Experience Component
const ProfessionalExperience = () => {
  const [openGalleryIndex, setOpenGalleryIndex] = useState(null)

  const jobs = [
    {
      company: "HVAC.COM",
      companyUrl: "https://www.hvac.com",
      role: "Senior Product Manager, Growth",
      period: "2024 — Present",
      location: "Charlotte, NC",
      description: "Responsible for developing and optimizing lead generation tools that drive conversions to HVAC.com's paid services. Collaborating closely with marketing, engineering, and design teams, I lead efforts that enhance customer engagement and drive measurable results:",
      achievements: [
        "Calculators: Built and launched a suite of calculators, increasing the conversion rate to our paid product from 0.1% to 7.3%.",
        "QuoteScore: A tool that helps homeowners understand their HVAC quotes, converting at a 6% rate to our paid offering.",
        "Video Content: Homeowners who engage with video content convert to paid products at a 3.4% rate.",
        "Landing Pages: Optimized landing pages to achieve a 2.3% conversion rate to paid products."
      ],
      images: [
        "/placeholder.svg?height=100&width=100",
        "/placeholder.svg?height=100&width=100"
      ]
    },
    {
      company: "HURD AI",
      companyUrl: "https://hurd.ai",
      role: "Co-founder & Product Advisor",
      period: "2023 — Present",
      location: "Berkeley, CA",
      description: "",
      achievements: [
        "Led the development of AI-powered educational tools: a Mac app and a web-based chatbot.",
        "Drove 700% user growth post launch.",
        "Versatility in roles, including Strategy, Marketing, Support, User Research, and Quality Assurance, crucial in the successful launch and growth of Hurd AI."
      ],
      images: [
        "/placeholder.svg?height=100&width=100",
        "/placeholder.svg?height=100&width=100",
        "/placeholder.svg?height=100&width=100",
        "/placeholder.svg?height=100&width=100"
      ]
    },
    // ... (other job entries)
  ]

  const ImageGallery = ({ images, isOpen, onClose }) => {
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

    if (!isOpen) return null

    const nextImage = () => {
      setCurrentImageIndex((prevIndex) => (prevIndex + 1) % images.length)
    }

    const prevImage = () => {
      setCurrentImageIndex((prevIndex) => (prevIndex - 1 + images.length) % images.length)
    }

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            className="absolute top-4 right-4 text-white"
            onClick={onClose}
          >
            <X className="w-6 h-6" />
          </button>
          <Image
            src={images[currentImageIndex]}
            alt={`Gallery image ${currentImageIndex + 1}`}
            width={800}
            height={600}
            className="max-w-full max-h-[80vh] object-contain"
          />
          <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-4">
            <button className="bg-white text-black px-4 py-2 rounded" onClick={prevImage}>
              Previous
            </button>
            <button className="bg-white text-black px-4 py-2 rounded" onClick={nextImage}>
              Next
            </button>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <section id="experience" className={`py-20 bg-gradient-to-b ${sectionColors[2]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">Professional Experience</h2>
        <div className="space-y-16">
          {jobs.map((job, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-lg shadow-xl p-6 relative overflow-hidden"
            >
              <div className="flex items-center mb-4">
                <div className="w-16 h-16 bg-gray-200 rounded-full mr-4 flex items-center justify-center overflow-hidden">
                  <Image
                    src={`/placeholder.svg?height=48&width=48`}
                    alt={`${job.company} logo`}
                    width={48}
                    height={48}
                    className="object-contain"
                  />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-primary mb-1">
                    <a href={job.companyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {job.company}
                    </a>
                    {job.company === "HVAC.COM" && (
                      <span className="text-sm font-normal text-gray-600 ml-2">(Acquired by Trane Technologies May 2024)</span>
                    )}
                    {job.company === "LEVER" && (
                      <span className="text-sm font-normal text-gray-600 ml-2">(Acquired by Employ July 2022)</span>
                    )}
                  </h3>
                  <h4 className="text-xl font-semibold">{job.role}</h4>
                </div>
              </div>
              <p className="text-gray-600 mb-4">{job.period} | {job.location}</p>
              {job.description && <p className="text-gray-700 mb-4">{job.description}</p>}
              <ul className="list-disc list-inside text-gray-700 space-y-2 mb-4">
                {job.achievements.map((achievement, achievementIndex) => (
                  <li key={achievementIndex} className="mb-2">
                    {achievement.split(":").map((part, partIndex) => 
                      partIndex === 0 ? 
                        <span key={partIndex} className="font-semibold">{part}:</span> : 
                        <span key={partIndex}>{part}</span>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 mt-4">
                {job.images.map((image, imageIndex) => (
                  <Image
                    key={imageIndex}
                    src={image}
                    alt={`${job.company} image ${imageIndex + 1}`}
                    width={100}
                    height={100}
                    className="rounded-md cursor-pointer object-cover"
                    onClick={() => setOpenGalleryIndex(index)}
                  />
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {openGalleryIndex !== null && (
          <ImageGallery
            images={jobs[openGalleryIndex].images}
            isOpen={true}
            onClose={() => setOpenGalleryIndex(null)}
          />
        )}
      </AnimatePresence>
    </section>
  )
}

// Projects Component
const Projects = () => {
  const projects = [
    {
      title: "AI-Powered Learning Platform",
      description: "Developed an adaptive learning system using machine learning algorithms to personalize educational content.",
      technologies: ["Python", "TensorFlow", "React", "Node.js"],
      image: "/placeholder.svg?height=400&width=600"
    },
    {
      title: "Smart Home Energy Management",
      description: "Created an IoT solution for optimizing home energy consumption using predictive analytics.",
      technologies: ["IoT", "Machine Learning", "Cloud Computing", "Mobile App Development"],
      image: "/placeholder.svg?height=400&width=600"
    },
  ]

  return (
    <section id="projects" className={`py-20 bg-gradient-to-b ${sectionColors[3]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">Projects</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {projects.map((project, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-lg shadow-xl overflow-hidden"
            >
              <Image
                src={project.image}
                alt={project.title}
                width={600}
                height={400}
                className="w-full h-48 object-cover"
              />
              <div className="p-6">
                <h3 className="text-xl font-bold mb-2 text-gray-800">{project.title}</h3>
                <p className="text-gray-600 mb-4">{project.description}</p>
                <div className="flex flex-wrap">
                  {project.technologies.map((tech, techIndex) => (
                    <span key={techIndex} className="bg-gray-200 text-gray-700 px-2 py-1 rounded-full text-sm mr-2 mb-2">{tech}</span>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Career Highlights Component
const CareerHighlights = () => {
  const highlights = [
    {
      title: "Diverse Expertise",
      description: "Experience in Social Media, Legal Tech, Marketing Tech, HR Tech.",
      icon: <Rocket className="w-6 h-6" />
    },
    {
      title: "11 Years in SaaS",
      description: "Led transformative projects at Oracle, Rocket Lawyer, Sendoso, and Lever.",
      icon: <Brain className="w-6 h-6" />
    },
    {
      title: "Global Impact",
      description: "Collaborated with partners, led integrations, and expanded into new markets.",
      icon: <GitBranch className="w-6 h-6" />
    },
    {
      title: "Data-Driven Decision Making",
      description: "Leveraged comprehensive data analysis to drive strategic decisions.",
      icon: <Users className="w-6 h-6" />
    }
  ]

  return (
    <section id="career-highlights" className={`py-20 bg-gradient-to-b ${sectionColors[4]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
          Career Highlights
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {highlights.map((highlight, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-lg shadow-xl p-6 flex items-start"
            >
              <div className="bg-primary text-white rounded-full p-3 mr-4">
                {highlight.icon}
              </div>
              <div>
                <h3 className="text-xl font-semibold mb-2 text-gray-800">{highlight.title}</h3>
                <p className="text-gray-600">{highlight.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Skills & Expertise Component
const SkillsExpertise = () => {
  const skillCategories = [
    {
      title: "Strategic",
      skills: ["Product Strategy", "Product Roadmap & Vision", "Competitive Analysis", "eCommerce & Marketplace Strategy", "B2B", "Customer Success"],
      icon: <Rocket className="w-6 h-6" />
    },
    {
      title: "Management",
      skills: ["Cross-Functional Leadership", "Stakeholder Management", "Team Building", "Mentorship", "Agile (Scrum, Kanban)"],
      icon: <Users className="w-6 h-6" />
    },
    {
      title: "Analytical & Research",
      skills: ["Data-Driven", "User-Centric Design", "A/B Testing", "Customer Research", "User Research", "Continuous Improvement"],
      icon: <Brain className="w-6 h-6" />
    },
    {
      title: "Technical",
      skills: ["AI", "LLM", "SQL", "API Development", "Integration", "Test-Driven Development (TDD)", "Behavior-Driven Development (BDD)"],
      icon: <GitBranch className="w-6 h-6" />
    },
    {
      title: "Tools",
      skills: ["Jira", "Confluence", "Trello", "Slack", "Github", "Pivotal Tracker", "Airtable", "InVision", "Figma", "FullStory", "Google Analytics", "Mixpanel", "Amplitude", "Looker", "Tableau", "Metabase", "LaunchDarkly", "Optimizely", "Zendesk", "SurveyMonkey", "ProductBoard", "ProductPlan"],
      icon: <Rocket className="w-6 h-6" />
    }
  ]

  return (
    <section id="skills" className={`py-20 bg-gradient-to-b ${sectionColors[5]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
          Skills & Expertise
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {skillCategories.map((category, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`bg-white rounded-lg shadow-xl p-6 ${category.title === "Tools" ? "md:col-span-2" : ""}`}
            >
              <div className="flex items-center mb-4">
                <div className="bg-primary text-white rounded-full p-3 mr-4">
                  {category.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-800">{category.title}</h3>
              </div>
              <ul className={`list-disc list-inside text-gray-600 ${category.title === "Tools" ? "columns-2 md:columns-3 lg:columns-4" : ""}`}>
                {category.skills.map((skill, skillIndex) => (
                  <li key={skillIndex} className="mb-2">{skill}</li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Certifications Component
const Certifications = () => {
  const educationData = {
    degree: "Bachelor of Science in Business Information Technology",
    school: "Virginia Tech",
    location: "Blacksburg, VA",
    year: 2005,
    details: [
      "Specialized in Decision Support Systems",
      "Minor in Computer Science",
      "Relevant coursework: Database Management, Systems Analysis, Software Engineering"
    ]
  }

  const certifications = {
    "Product": [
      { name: "Product-led Certification", issuer: "Pendo", year: 2023 },
      { name: "Product Analytics Certification", issuer: "Pendo", year: 2023 },
      { name: "Product-Led Growth Fundamentals Certification", issuer: "ProductLed", year: 2023 },
      { name: "ProductBoard Certification", issuer: "ProductBoard", year: null }
    ],
    "AI": [
      { name: "AI for Product Management", issuer: "Pendo", year: 2023 },
      { name: "Introduction to Generative AI", issuer: "Google", year: 2023 }
    ],
    "Agile": [
      { name: "Certified Scrum Product Owner (CSPO)", issuer: "Scrum Alliance", year: 2013 },
      { name: "Certified ScrumMaster (CSM)", issuer: "Scrum Alliance", year: 2013 },
      { name: "Test-Driven Development (TDD) Practitioner", issuer: "", year: null },
      { name: "Behavior-Driven Development (BDD) Practitioner", issuer: "", year: null }
    ],
    "Management": [
      { name: "Certified Management Consultant (CMC)", issuer: "Institute of Management Consultants USA", year: 2010 }
    ]
  }

  const categoryIcons = {
    "Product": <Rocket className="w-4 h-4 text-primary mr-2" />,
    "AI": <Brain className="w-4 h-4 text-primary mr-2" />,
    "Agile": <GitBranch className="w-4 h-4 text-primary mr-2" />,
    "Management": <Users className="w-4 h-4 text-primary mr-2" />
  }

  return (
    <section id="certifications" className={`py-20 bg-gradient-to-b ${sectionColors[6]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
          Education & Certifications
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-lg shadow-xl p-6"
          >
            <div className="flex items-center mb-4">
              <GraduationCap className="w-6 h-6 text-primary mr-2" />
              <h3 className="text-xl font-semibold text-gray-800">Education</h3>
            </div>
            <div className="mb-4">
              <p className="text-lg font-medium text-gray-800">{educationData.degree}</p>
              <p className="text-gray-600">{educationData.school}, {educationData.location}</p>
              <p className="text-gray-600">({educationData.year})</p>
            </div>
            <div>
              <h4 className="text-md font-semibold mb-2 flex items-center text-gray-800">
                <BookOpen className="w-4 h-4 text-primary mr-2" />
                Academic Focus
              </h4>
              <ul className="list-disc list-inside text-gray-600">
                {educationData.details.map((detail, index) => (
                  <li key={index}>{detail}</li>
                ))}
              </ul>
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white rounded-lg shadow-xl p-6"
          >
            <div className="flex items-center mb-4">
              <Award className="w-6 h-6 text-primary mr-2" />
              <h3 className="text-xl font-semibold text-gray-800">Certifications</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(certifications).map(([category, certs], index) => (
                <div key={index}  className="mb-4">
                  <h4 className="text-md font-semibold mb-2 flex items-center text-gray-800">
                    {categoryIcons[category]}
                    {category}
                  </h4>
                  <ul className="space-y-1 text-sm">
                    {certs.map((cert, certIndex) => (
                      <li key={certIndex} className="text-gray-600">
                        <span className="font-medium">{cert.name}</span>
                        {cert.issuer && <span className="text-gray-500 text-xs block">{cert.issuer} {cert.year && `(${cert.year})`}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

// Recommendations Component
const Recommendations = () => {
  const recommendations = [
    {
      quote: "Kevin is the right people, a go-to PM.",
      author: "Wesley Barnes",
      title: "Director of Product Management"
    },
    {
      quote: "Kevin fought for the best possible experience, brokering agreements across PM, UX, and Engineering.",
      author: "Emily Leahy-Thieler",
      title: "Design Leader"
    },
    {
      quote: "Kevin is a top-notch PM who fights for quality products and his team.",
      author: "Christina James",
      title: "Staff Quality Assurance Analyst"
    },
    {
      quote: "Kevin is confident and comfortable in all interactions, whether with executives or across teams.",
      author: "Mark Walker",
      title: "Engineering Leader"
    }
  ]

  return (
    <section id="recommendations" className={`py-20 bg-gradient-to-b ${sectionColors[7]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
          Recommendations
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {recommendations.map((rec, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-white rounded-lg shadow-xl p-6"
            >
              <Quote className="w-8 h-8 text-primary mb-4" />
              <p className="text-lg mb-4 italic">"{rec.quote}"</p>
              <div className="text-right">
                <p className="font-semibold">{rec.author}</p>
                <p className="text-gray-600">{rec.title}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Let's Connect Component
const LetsConnect = () => {
  return (
    <section id="connect" className={`py-20 bg-gradient-to-b ${sectionColors[8]}`}>
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 text-white">
          Let's Connect!
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center text-lg mb-8 max-w-3xl mx-auto text-white"
        >
          Whether it's about product management or just to chat, I'd love to connect with you! Feel free to reach out via email, LinkedIn, or schedule a call using my Calendly link.
        </motion.p>
        <div className="flex justify-center space-x-6">
          <motion.a
            href="mailto:your.email@example.com"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="bg-white text-primary rounded-full p-4 hover:bg-gray-200 transition-colors"
          >
            <Mail className="w-6 h-6" />
          </motion.a>
          <motion.a
            href="https://www.linkedin.com/in/yourprofile"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="bg-white text-primary rounded-full p-4 hover:bg-gray-200 transition-colors"
          >
            <Linkedin className="w-6 h-6" />
          </motion.a>
          <motion.a
            href="https://calendly.com/yourprofile"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="bg-white text-primary rounded-full p-4 hover:bg-gray-200 transition-colors"
          >
            <Calendar className="w-6 h-6" />
          </motion.a>
        </div>
      </div>
    </section>
  )
}

// Footer Component
const Footer = () => (
  <footer className="bg-gray-800 text-white py-8">
    <div className="container mx-auto px-4 text-center">
      <p>&copy; 2023 Kevin Middleton. All rights reserved.</p>
    </div>
  </footer>
)

// Main Portfolio Page Component
export default function Component() {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <HeroSection />
        <AboutMe />
        <ProfessionalExperience />
        <Projects />
        <CareerHighlights />
        <SkillsExpertise />
        <Certifications />
        <Recommendations />
        <LetsConnect />
      </main>
      <Footer />
    </div>
  )
}
