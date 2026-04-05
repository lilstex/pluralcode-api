-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "hasHumanitarianExperience" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isInterestedInTraining" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "isLocalOrNational" BOOLEAN NOT NULL DEFAULT true;
