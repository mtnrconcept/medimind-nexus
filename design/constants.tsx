
import React from 'react';

export const MOCK_PAPERS = [
  {
    id: '1',
    title: 'CRISPR-Cas9 Gene Editing in Cardiovascular Therapy',
    author: 'Dr. Elena Vance',
    date: '2024-11-12',
    abstract: 'Exploring the precision of CRISPR in targeting cardiological genetic mutations within endothelial cells.',
    tags: ['Genetics', 'Cardiology', 'CRISPR'],
    relevance: 98,
    citations: 1240
  },
  {
    id: '2',
    title: 'Neural Link: Synthetic Synapse Integration in Post-Trauma Recovery',
    author: 'Prof. Julian Thorne',
    date: '2024-10-05',
    abstract: 'A study on the biocompatibility of silicon-based synapses and their interface with biological grey matter.',
    tags: ['Neurology', 'Bio-Engineering', 'AI'],
    relevance: 94,
    citations: 856
  },
  {
    id: '3',
    title: 'Nano-Robotics in Targeted Oncology: 5-Year Clinical Outcomes',
    author: 'Dr. Sarah Chen',
    date: '2024-09-28',
    abstract: 'Long-term monitoring of autonomous nanobots used for localized chemotherapy delivery in stage IV sarcomas.',
    tags: ['Oncology', 'Nanotech', 'Robotics'],
    relevance: 91,
    citations: 2100
  },
  {
    id: '4',
    title: 'Metabolic Optimization via Microbiome Re-Engineering',
    author: 'Dr. Marcus Holloway',
    date: '2024-12-01',
    abstract: 'Synthetic biology approaches to reshaping intestinal flora for permanent metabolic enhancement.',
    tags: ['Metabolism', 'Microbiome', 'SynBio'],
    relevance: 88,
    citations: 432
  }
];

export const Icons = {
  Search: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
  ),
  Pulse: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  Brain: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  ),
  Chart: () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
  )
};
