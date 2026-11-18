import React, { type ReactNode } from "react";
import { Link } from "wouter";
import {
  courseGroupManagementPath,
  groupChatPath,
} from "@/lib/citylinkNavigation";

type NavigationLinkProps = {
  className?: string;
  children: ReactNode;
};

export function CourseGroupLink({
  courseId,
  className,
  children,
}: NavigationLinkProps & { courseId: string }) {
  return (
    <Link href={courseGroupManagementPath(courseId)} className={className}>
      {children}
    </Link>
  );
}

export function GroupChatLink({
  groupId,
  className,
  children,
}: NavigationLinkProps & { groupId: string }) {
  return (
    <Link href={groupChatPath(groupId)} className={className}>
      {children}
    </Link>
  );
}
